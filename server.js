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

let serverHost; let io; // Server
let clients = []; // Used to store the gameData
let isRunning = false; // Gameloop state
let consumable; // In classic game snake this would be the food
let round = 0; // Rounds played since host is running

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
function resetGameData(fst1, snd1, dir1, fst2, snd2, dir2) {
    const initialPosition = [{ x: 0, y: 0 }]; // Default position
    const leftDirection = 'left'; // Default direction
    Object.keys(clients).forEach((clientID, index) => {
        if (Object.keys(clients).length === 2) { // Check the number of entry
            if (index === 0) { // If it's the first entry                            
                clients[clientID].position = [{ x: fst1, y: snd1 }];
                clients[clientID].direction = dir1;
            } else if (index === 1) { // If it's the second entry                               
                clients[clientID].position = [{ x: fst2, y: snd2 }];
                clients[clientID].direction = dir2;
            }
        } else { // For more than 2 clients, you might want to handle this differently
            clients[clientID].position = initialPosition;
            clients[clientID].direction = leftDirection;
        }
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
            console.log(`\n${config.serverMessage} ${port}`);
            io.on('connection', handleConnection);
            resolve({ serverHost, io });
        });
    });
}

// Handle incomming connections 
// With this setup the server expects 2 clients   
function handleConnection(socket) {
    let id = socket.id;
    const clientIdentifier = socket.handshake.headers['client-identifier']; // Get the identifier from the handshake headers    
    if (config.defaultIdentifier.includes(clientIdentifier)) {

        // Create player and direction for first client
        let position = [{ x: config.client1StartPosX, y: config.client1StartPosY }];
        let direction = config.client1StartDir;
        // Create player and direction for second client 
        if (Object.keys(clients).length == 1) {
            position = [{ x: config.client2StartPosX, y: config.client2StartPosY }];
            direction = config.client2StartDir;
        }
        let collision = 0;
        clients[id] = { position: position, direction: direction, collision: collision }; // Create gameData to be used to send to clients        

        // Reject more than 2 clients
        if (Object.keys(clients).length > 2) {
            console.log(`\n${config.maxClinetsMessage} : ${id}`); // Log to host
            socket.disconnect();
            return;
        }

        console.log(`\n${config.clientConnectMessage} : ${id}`); // Log message to server console
        socket.emit('syncID', id); // Send the id to newly connected client
        let hostMessage = `${config.clientMessage}`;
        socket.emit('hostMessage', hostMessage);  // Broadcast welcome message to the newly connected client 

        // Setup listeners
        socket.on('moveClient', (clientID, direction) => {
            handleClientInput(clientID, direction);
        });

        socket.on('disconnect', () => {
            console.log(`\n${config.clientDisconnectMessage} : ${id}`); // Log disconnect to host
            delete clients[id];
            isRunning = false;
            io.sockets.emit('gameState', isRunning); // This stops the game for clients still connected
            io.sockets.emit('hostMessage', `${config.clientDisconnectMessage} - ${config.clientMessage}`); //Send client disconnect to all clients
        });

        // Clients have control over game start/restart
        socket.on('startGame', () => {
            // Check the number of connected clients using Object keys length
            if (Object.keys(clients).length == 2) {
                socket.emit('syncData', generateSyncData()); // Send data to all clients        
                runUpdate();
                round++;
            }
        });

        // Check the number of connected clients using Object keys length
        if (Object.keys(clients).length > 1) {            
            io.sockets.emit('hostMessage', `${config.readyMessage}`); // Emit readyMessage if 2 clients are connected
            // The server console has control over the game start too
            rl.question(`\n${config.readyMessage}`, () => {
                socket.emit('syncData', generateSyncData()); // Send data to all clients        
                runUpdate();
                round++;
            });
        }

    } else {
        // Disallow the connection
        console.log(`\n${config.clientDisallowMessage}`);
        socket.disconnect();
    }
}

// Collition detection 
function checkCollision() {
    // Check for collision with walls
    for (let key in clients) {
        const thisClient = clients[key].position;
        const head = thisClient[0];
        if (head.x < 1 || head.x > config.gridWidth - 2 || head.y < 1 || head.y > config.gridHeight - 2) {
            clients[key].collision++;
            return true;
        }

        // Check for collision with other clients
        for (let otherKey in clients) {
            if (otherKey !== key) { // Exclude the current client from this check
                const otherClient = clients[otherKey].position;
                for (let i = 1; i < otherClient.length; i++) {
                    if (otherClient[i].x === head.x && otherClient[i].y === head.y) {
                        clients[otherKey].collision++;
                        return true; // Collision detected with another client
                    }
                }
            }
        }

        // Check for self collision
        for (let i = 1; i < thisClient.length; i++) {
            if (thisClient[i].x === head.x && thisClient[i].y === head.y) {
                return true; // Collision detected with self
            }
        }
    }
    return false; // No collisions found
}

// Handle client input to move the client
function handleClientInput(clientID, direction) {
    // Check for collision 
    if (!checkCollision()) {
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
    } else {
        // Collision happend  
        isRunning = false;
        resetGameData(config.client1StartPosX, config.client1StartPosY, config.client1StartDir, config.client2StartPosX, config.client2StartPosY, config.client2StartDir); //Reset gameData
        io.sockets.emit('gameState', isRunning);// This would stop the game 
        io.sockets.emit('hostMessage', config.gameoverMessage); // Send  message to all clients      
        console.log(`\n${config.gameoverMessage}`);
        rl.question(`\n${config.readyMessage}`, () => {
            runUpdate();
        });
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
            collision: player.collision,
            consumable: consumable,
            round: round
        };
    });
    return JSON.stringify(state);
}
// Sends collected data to clients
function broadcast(data) {
    io.sockets.emit('syncData', data);
}

// Run the game loop
function runUpdate() {
    isRunning = true;
    io.sockets.emit('hostMessage', config.startMessage); // Send  message to all clients      
    io.sockets.emit('gameState', isRunning);// This would start the game 
    console.log(`\n${config.runningMessage}`);
    // We use this interval with serverUpdateSpeed/ms delay for update game data
    const intervalId = setInterval(() => {
        if (isRunning) {
            broadcast(generateSyncData());
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
        console.error(`\n${config.serverArgumentsMessage} : ${error.message}`); // Some unhandled error       
    }
}
start();