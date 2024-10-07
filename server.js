// server.js of WormRacer
import http from 'http';
import { Server } from 'socket.io';
import minimist from 'minimist';
import readline from 'readline';
import { stdin } from 'process';
import fs from 'fs';
import * as functions from './scripts/functions.js';

// Setup host user input output
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
stdin.setEncoding('utf8');
stdin.resume();
stdin.setRawMode(true);

const args = minimist(process.argv.slice(2)); // Arguments handling 
const config = JSON.parse(fs.readFileSync('config.json', 'utf8')); // Load configuration file
const textAsset = JSON.parse(fs.readFileSync('./assets/text.json', 'utf8')); // Load 

let serverHost; let io; // Server
let clients = []; // Used to store the gameData
let isRunning = false; // Gameloop state
let consumable; // In classic game snake this would be the food
let round = 0; // Rounds played since host is running
let roundTime = config.roundTime; //Set the time

// Get a random position on the grid for the consumable
function spawnConsumable() {
    let tmpCon = {
        x: Math.floor(Math.random() * (config.gridWidth - 2)) + 1, // Adjusted to include boundaries
        y: Math.floor(Math.random() * (config.gridHeight - 2)) + 1 // Adjusted to include boundaries
    };
    tmpCon.x = functions.clamp(tmpCon.x, 1, config.gridWidth-1);
    tmpCon.y = functions.clamp(tmpCon.y, 1, config.gridHeight-1);
    return tmpCon;
} 

// Reset positions and directions for all clients
function resetGameData(fst1, snd1, dir1) {
    const initialPosition = [{ x: 0, y: 0 }]; // Default position
    const leftDirection = 'left'; // Default direction
    Object.keys(clients).forEach((clientID, index) => {                                         
        clients[clientID].position = [{ x: fst1, y: snd1 }];
        clients[clientID].direction = dir1; 
    });
}

// Initialize a new server and listen for incomming connections and handle them
function initHost(port) {
    consumable = spawnConsumable(); // Prepare the first consumable position
    return new Promise((resolve, reject) => {
        serverHost = http.createServer();
        io = new Server(serverHost, {
            withCredentials: true // Enable credentials for this request           
        });
        // Listen and handle
        serverHost.listen(port, () => {
            console.log(`\n${textAsset.serverMessage} ${port}`);
            io.on('connection', handleConnection);
            resolve({ serverHost, io });
        });
    });
}

// Handle incomming connections  
function handleConnection(socket) {
    let id = socket.id;
    const clientIdentifier = socket.handshake.headers['client-identifier']; // Get the identifier from the handshake headers    
    if (config.defaultIdentifier.includes(clientIdentifier)) {
        // Create position and direction for clients
        let tmpX = config.clientsStartPosX+Object.keys(clients).length;
        let tmpY = config.clientsStartPosY+Object.keys(clients).length;         
        let position = [{ x: tmpX, y: tmpY }];
        let direction = config.clientsStartDir;      
        let collision = 0;
        let consumed = 0;
        let score = 0;        
        clients[id] = { position: position, direction: direction, score: score, consumed: consumed, collision: collision }; // Create gameData to be used to send to clients        

        // Reject clients more than predefined in config.json
        if (Object.keys(clients).length > config.maxClients) {
            console.log(`\n${textAsset.maxClinetsMessage} : ${id}`); // Log to host
            socket.disconnect();
            return;
        }
        
        let clientsConnected = `${textAsset.clientsConnectedMessage}: ${Object.keys(clients).length} ♦ `;
        console.log(`\n${textAsset.clientConnectMessage} : ${id}`); // Log message to server console
        socket.emit('syncID', id); // Send the id to newly connected client
        let hostMessage = `${clientsConnected}${textAsset.clientMessage}`;
        socket.emit('hostMessage', hostMessage);  // Broadcast welcome message to the newly connected client 

        // Setup listeners
        socket.on('moveClient', (clientID, direction) => {
            handleClientInput(clientID, direction);
        });

        socket.on('disconnect', () => {
            console.log(`\n${textAsset.clientDisconnectMessage} : ${id}`); // Log disconnect to host
            delete clients[id];
            isRunning = false;
            io.sockets.emit('gameState', isRunning); // This stops the game for clients still connected
            clientsConnected = `${textAsset.clientsConnectedMessage}: ${Object.keys(clients).length} ♦ `;
            io.sockets.emit('hostMessage', `${clientsConnected}${textAsset.clientDisconnectMessage} - ${textAsset.clientMessage}`); //Send client disconnect to all clients
        });

        // Clients have control over game start/restart
        socket.on('startGame', () => {
            // Check the number of connected clients using Object keys length
            if (Object.keys(clients).length >= config.minClients) {
                socket.emit('syncData', generateSyncData()); // Send data to all clients        
                runUpdate();
                round++;
            }
        });

        // Check the number of connected clients using Object keys length
        if (Object.keys(clients).length >= config.minClients) {            
            io.sockets.emit('hostMessage', `${clientsConnected}${textAsset.readyMessage}`); // Emit readyMessage if minClients are connected
            // The server can have control over the game start too
            //rl.question(`\n${textAsset.readyMessage}`, () => {
            //    socket.emit('syncData', generateSyncData()); // Send data to all clients        
            //    runUpdate();
            //    round++;
            //});
        }

    } else {
        // Disallow the connection
        console.log(`\n${textAsset.clientDisallowMessage}`);
        socket.disconnect();
    }
}

// Collition detection 
function checkCollision() {     
    for (let key in clients) {
        const thisClient = clients[key].position;
        const head = thisClient[0];

        // Check for collision with walls
        if (head.x < 1 || head.x > config.gridWidth - 2 || head.y < 1 || head.y > config.gridHeight - 2) {
            clients[key].collision++; // This client had a collision
            updateScoreForClients(clients[key]); // Update score for this client
            return true;
        }

        // Check for self collision
        for (let i = 1; i < thisClient.length; i++) {
            if (thisClient[i].x === head.x && thisClient[i].y === head.y) {
                thisClient[i].collision++; // This client had a collision
                updateScoreForClients(clients[key]); // Update score for the colliding client
                return true; // Collision detected with self
            }
        }

        // Check for collision with other clients
        for (let otherKey in clients) {
            if (otherKey !== key) { // Exclude the current client from this check
                const otherClient = clients[otherKey].position;
                for (let i = 1; i < otherClient.length; i++) {
                    if (otherClient[i].x === head.x && otherClient[i].y === head.y) {
                        clients[otherKey].collision++; // This client had a collision
                        updateScoreForClients(clients[key]); // Update score for the colliding client
                        return true; // Collision detected with another client
                    }
                }
            }
        }
    }
    return false; // No collisions found
}

//Helper function for checkCollision() to update clients scores
function updateScoreForClients(client) {
    for (let key in clients) {
        if (clients[key] !== client) { 
            clients[key].score++; // Add a point to score
        }
    }
}

//Stops the game and resets clients positions and directions
function gameOver() {
    isRunning = false;
    resetGameData(config.clientsStartPosX, config.clientsStartPosY, config.clientsStartDir); //Reset gameData
    io.sockets.emit('gameState', isRunning);// This would stop the game 
    let clientsConnected = `${textAsset.clientsConnectedMessage}: ${Object.keys(clients).length} ♦ `;
    io.sockets.emit('hostMessage', `${clientsConnected}${textAsset.gameoverMessage}`); // Send  message to all clients      
    console.log(`\n${textAsset.gameoverMessage}`);
    rl.question(`\n${textAsset.readyMessage}`, () => {
        runUpdate(); 
    });
}

// Handle client input to move the client
function handleClientInput(clientID, direction) {
    // Check for collision 
    if (checkCollision()) gameOver();
        const head = { ...clients[clientID].position[0] };
        switch (direction) {
            case 'up': head.y--; break;
            case 'down': head.y++; break;
            case 'left': head.x--; break;
            case 'right': head.x++; break;
        }
        clients[clientID].position.unshift(head);
        if (head.x === consumable.x && head.y === consumable.y) {
            consumable = spawnConsumable(); // Spawn a new consumable
        } else {
            clients[clientID].position.pop();
        }    
}

// Collect data to send to clients 
function generateSyncData() {
    let state = {};
    Object.keys(clients).forEach(key => {
        const player = clients[key];
        state[key] = {
            position: player.position,
            direction: player.direction,
            score: player.score,
            consumed: player.consumed,
            collision: player.collision,
            consumable: consumable,
            round: round,
            roundTime: roundTime
        };
    });
    return JSON.stringify(state);
}
// Sends collected data to clients
function broadcast(data) {
    io.sockets.emit('syncData', data);
}

// Compares who has the longest
function dComp() {
    let maxLength = -1;
    let clientWithLongestPos = null;

    for (let key in clients) {
        const length = clients[key].position.length;
        if (length > maxLength) {
            maxLength = length;
            clientWithLongestPos = clients[key];
        }
    }
    clientWithLongestPos.score++; // Add a point to score
    broadcast(generateSyncData()); // Update gameData
}

// Run the game loop
function runUpdate() {
    isRunning = true;
    let countdownTime = config.roundTime*1000; // Seconds to milliseconds -Resets the timer 
    //io.sockets.emit('hostMessage', ${textAsset.runningMessage}); // Send  message to all clients      
    io.sockets.emit('gameState', isRunning);// This would start the game 
    console.log(`\n${textAsset.runningMessage}`);    
    // We use this interval with serverUpdateSpeed/ms delay for update game data
    const intervalId = setInterval(() => {
        if (isRunning) {           
            broadcast(generateSyncData());
            countdownTime -= config.serverUpdateSpeed; // Run timer
            roundTime = Math.floor(countdownTime / 1000) // Milliseconds to seconds
            if (countdownTime < 0) { // Time is up
                clearInterval(intervalId);  
                dComp(); // Compare worm length
                gameOver();     
            }
        } else {
            clearInterval(intervalId);
        }
    }, config.serverUpdateSpeed);
}

// Checks for arguments and starts a server
async function start() {
    let port = config.defaultPort; // Default port if none is provided
    if (args._ && args._.length > 0) { // Check for at least one argument
        port = parseInt(args._, 10); // Use the first argument as the port
    }

    try {
        const serverData = await initHost(port);
        global.serverHost = serverData.server;
    } catch (error) {
        console.error(`\n${textAsset.serverArgumentsMessage} : ${error.message}`); // Some unhandled error       
    }
}
start();