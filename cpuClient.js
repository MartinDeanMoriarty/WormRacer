// cpuClient.js of WormRacer
import { io } from "socket.io-client";
import minimist from 'minimist';
import fs from 'fs';
import * as render from './scripts/render.js';
import * as functions from './scripts/functions.js';

const args = minimist(process.argv.slice(2)); //Arguments handling 
const config = JSON.parse(fs.readFileSync('config.json', 'utf8')); // Load configuration file

let clientMessage = config.clientMessage; //To display host messages
let client; // Client
let clientID; // This will store the clients id from the server
let gameData; // This will store the latest game data received from the server
let isRunning = false; //Used to start and stop the game loop 

// Initialize the client
function initClient(ip, port) {
    return new Promise((resolve, reject) => {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(config.timeoutMessage));
            }, config.timeoutDuration);
        });
        // Make sure the client is initialiazid and ready to do shi...
        Promise.race([
            new Promise((resolve, reject) => {
                const socket = io(`http://${ip}:${port}`, {
                    withCredentials: true, // Enable credentials for this request
                    extraHeaders: {
                        'client-identifier': functions.generateUniqueIdentifier(config.defaultIdentifier) // Send a unique identifier to the server
                    }
                });
                // Set up the listeners
                // Hanlde connect
                socket.on('connect', () => {
                    resolve(socket);
                });
                // Hanlde disconnect
                socket.on('disconnect', () => {
                    reject(new Error(config.disconnectMessage));
                });
                // Handle client id synchnonisation
                socket.on('syncID', (id) => {
                    clientID = id;
                });
                // Handle messages from the host
                socket.on('hostMessage', (message) => {
                    clientMessage = message;
                });
                // Handle the game state
                socket.on('gameState', (running) => {
                    isRunning = running;
                });
                // Hanlde game data
                socket.on('syncData', (data) => {
                    gameData = data;
                    //console.log(`\ngameData: ${gameData}`);                     
                });
            }),
            timeoutPromise
        ]).then((socket) => {
            console.log(`\n${config.connectMessage} IP: ${ip}, Port: ${port}`);
            resolve(socket);
            runUpdate(); // Run the game loop            
        }).catch((error) => {
            reject(error);
        });
    });
}

function runUpdate() {
    const intervalId = setInterval(() => {
        if (isRunning && gameData) {
            const state = JSON.parse(gameData); // Parse the JSON gameData from the server            
            let consumableCoordinates = null;
            
            console.log(`State : ${gameData}`);  // Just to know it is running and updating
            
            if (state[clientID] && state[clientID].consumable && state[clientID].position) {
                const position = state[clientID].position[0];
                const consumable = state[clientID].consumable;
                
                // Set target coordinates directly to the consumable's coordinates
                consumableCoordinates = { x: consumable.x, y: consumable.y };
            }

            if (consumableCoordinates) {            
                const position = state[clientID].position[0];
                const directionX = consumableCoordinates.x > position.x ? 'right' : 'left';
                const directionY = consumableCoordinates.y > position.y ? 'down' : 'up';                  

                // Move along the x-axis first
                if (position.x !== consumableCoordinates.x) {
                    client.emit('moveClient', clientID, directionX);
                } else if (position.y !== consumableCoordinates.y) {
                    // Once x-axis is aligned, move along the y-axis
                    client.emit('moveClient', clientID, directionY);
                }
            }

        } else {
            console.log(`State : Waiting...`);  // Just to know it is running and updating
        }
    }, config.botUpdateSpeed);
}

// Starts a client and tries to connect to a specific server provided by arguments or default values will be used
async function start() {
    let ip = config.defaultIP;
    let port = config.defaultPort;
    render.loadAssets(); // Load assets from text files 
    if (args._ && args._.length > 0) {
        const joinParts = args._[0].split(':');
        if (joinParts.length === 2) {
            ip = joinParts[0];
            port = parseInt(joinParts[1], 10); // Ensure the port is a number
        } else {
            console.error(`\n${config.clientArgumentsMessage}`); // Syntax error
            return;
        }
    }

    try {
        client = await initClient(ip, port); // Initialize a client    
    } catch (error) {
        console.error(`Error: ${error.message}`);
    }
}
start();
