// client.js of WormRacer
import { io } from "socket.io-client";
import minimist from 'minimist';
import readline from 'readline';
import { stdin } from 'process';
import fs from 'fs';
import * as render from './scripts/render.js';
import * as functions from './scripts/functions.js';

// Setup client user input output
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
stdin.setEncoding('utf8');
stdin.resume();
stdin.setRawMode(true);

const args = minimist(process.argv.slice(2)); //Arguments handling 
const config = JSON.parse(fs.readFileSync('config.json', 'utf8')); // Load configuration file

let clientMessage = config.clientMessage; //To display host messages
let client; // Client
let clientID; // This will store the clients id from the server
let gameData; // This will store the latest game data received from the server
let isRunning = false; //Used to start and stop the game loop 

// Simple update method
function runUpdate() {
    // We use this interval with 32ms(frametime) delay to simulate game rendering at 31,25fps
    const intervalId = setInterval(() => {
        if (isRunning) {
            //"Render" the game scnene             
            render.game(gameData, clientID);
        } else {
            let topLeft = config.titleMessage;
            let middleCenter = "";
            let bottomRight = clientMessage;
            // "Render" the title scene             
            render.title(gameData, clientID, topLeft, middleCenter, bottomRight);
            rl.question(``, () => {
                client.emit('startGame'); //Clients have control over game start/restart
            });
        }
    }, 32);
}

// Handle client inputs
function handleInput() {
    // Lets check for client input     
    stdin.on('data', (key) => {
        let direction;
        if (key === '\u001B\u005B\u0041' && direction !== 'down') direction = 'up'; // Up arrow
        if (key === '\u001B\u005B\u0042' && direction !== 'up') direction = 'down'; // Down arrow
        if (key === '\u001B\u005B\u0043' && direction !== 'left') direction = 'right'; // Right arrow
        if (key === '\u001B\u005B\u0044' && direction !== 'right') direction = 'left'; // Left arrow
        // Send the new direction to the server instantly
        client.emit('moveClient', clientID, direction);
    });
}

// Initialize the client
function initClient(ip, port) {
    // Respect a connection time out set with "config.timeoutDuration"
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
                });
            }),
            timeoutPromise
        ]).then((socket) => {
            // Client is ready to do shi....
            console.log(`\n${config.connectMessage} IP: ${ip}, Port: ${port}`);
            resolve(socket);
            handleInput(); // Start to handle input  
            runUpdate(); // Run the game loop            
        }).catch((error) => {
            reject(error); // Timeout  
            functions.processPrompt(stdin, process, rl,'exit', `\n${config.exitMessage}`);
        });
    });
} 

// Starts a client and trys to connect to a specific server provided by arguments or default values will be used
async function start() {
    // Get default values
    let ip = config.defaultIP;
    let port = config.defaultPort;
    render.loadAssets(); // Load assets from text files  
    if (args._ && args._.length > 0) { // Check for at least one argument
        const joinParts = args._[0].split(':');
        if (joinParts.length === 2) {
            ip = joinParts[0];
            port = parseInt(joinParts[1], 10); // Ensure the port is a number
        } else {
            console.error(`\n${config.clientArgumentsMessage}`); // Syntax error
            functions.processPrompt(stdin, process, rl,'exit', `\n${config.exitMessage}`);
            //return;
        }
    }

    try {
        client = await initClient(ip, port); // Initialize a client    
    } catch (error) {
        console.error(`\n${config.clientArgumentsMessage}: ${error.message}`); // Some unhandled error
        functions.processPrompt(stdin, process, rl,'exit', `\n${config.exitMessage}`);
    }
}
start();