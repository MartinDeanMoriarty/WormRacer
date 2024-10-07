import fs from 'fs';
import path from 'path';

const config = JSON.parse(fs.readFileSync('config.json', 'utf8')); // Load configuration file
const textAsset = JSON.parse(fs.readFileSync('./assets/text.json', 'utf8')); // Load text asset

// For game assets
let client1Representation;
let client1TailRepresentation;
let client2Representation;
let client2TailRepresentation;
let tmpClientRepresentation;
let consumableRepresentation;
let gridBorderRepresentation;
let titleBorderRepresentation;
let logoLines;

// Load single asset from text file
function loadAsset(asset, name) {
    const filePath = path.join(`./assets/${asset}/`, `${name}.txt`);
    return fs.readFileSync(filePath, 'utf8').trim();
}

// Load all assets
export async function loadAssets() {
    const assetPromises = [
        loadAsset('game', 'border'),
        loadAsset('game', 'consumable'),
        loadAsset('game', 'client-1'),
        loadAsset('game', 'client-2'),
        loadAsset('game', 'client-1-tail'),
        loadAsset('game', 'client-2-tail'),
        loadAsset('title', 'border'),
        loadAsset('title', 'logo')
    ];

    try {
        const results = await Promise.all(assetPromises);
        [
            gridBorderRepresentation,
            consumableRepresentation,
            client1Representation,
            client2Representation,
            client1TailRepresentation,
            client2TailRepresentation,
            titleBorderRepresentation,
            logoLines
        ] = results;
    } catch (error) {
        console.error(`${textAsset.assetErrorMessage} : ${error}`);
    }
}

// To output each line of a file
function printAssetLines(content) {   
    if (!content) content = logoLines; 
    const lines = content.split('\n'); // Split the content into individual lines  
    lines.forEach((line, index) => {
        // Output content
        console.log(`${line}`);
    });
}

// Output game statistics
function printGamestatLines(gameData, clientID) {
    let clientsScore = ``;
    let clientsRounds;   

    if (!gameData) { // Use a default at start
        clientsScore = ``;
        clientsRounds = '0 ';
    } else {
        const state = JSON.parse(gameData); // Parse the JSON gameData from the server         
        // Set scores
        for (const player of Object.keys(state)) { // Iterate over all players
            let clientScore = 0; 
            clientScore = state[player].score || 0;
            clientsScore += ` ► ${clientScore} ◄`;          
        }  
        clientsRounds = `${state[clientID].roundTime} : ${state[clientID].round} `;
    }
    const borderLength = config.gridWidth; // Fixed width for the border
    // Build and calculate
    let boarderLine = `${titleBorderRepresentation.repeat(borderLength)}`;
    let tmpGs = `${clientsScore}${clientsRounds}`;
    const gsLength = tmpGs.length;
    const spaceCountGs = Math.floor((borderLength - gsLength) - 2);
    const middleGsSpaces = ' '.repeat(spaceCountGs);
    let gamestatsLines = `${titleBorderRepresentation}${clientsScore}${middleGsSpaces}${clientsRounds}${titleBorderRepresentation}\n${boarderLine}`;
    // Output
    console.log(gamestatsLines);
}

// Build and output the title screen
// This is just a simple layout with restricted proportions
// It uses config.gridWidth to be part with game()
// top=top left aligned text, middle = asset, bottom = right aligned text
export function title(gameData, clientID, top, middle, bottom) {
    console.clear(); // Clear terminal for next frame
    const borderLength = config.gridWidth; // Fixed width for the border
    const topLength = top.length;
    const bottomLength = bottom.length;
    // Calculate     
    const spaces = ' '.repeat(borderLength - 2);
    const spaceCountTop = Math.floor((borderLength - topLength) - 2);
    const rightSpacesTop = ' '.repeat(spaceCountTop);
    const spaceCountBottom = Math.floor((borderLength - bottomLength) - 2);
    const leftSpacesBottom = ' '.repeat(spaceCountBottom);
    // Build
    let boarderLine = `${titleBorderRepresentation.repeat(borderLength)}`;
    let spaceLine = `${titleBorderRepresentation}${spaces}${titleBorderRepresentation}`;
    let topLine = `${titleBorderRepresentation}${top}${rightSpacesTop}${titleBorderRepresentation}\n`;
    let titleTopLines = `${boarderLine}\n${spaceLine}\n${spaceLine}\n${topLine}${spaceLine}\n${spaceLine}\n${spaceLine}`;
    let bottomLine = `${titleBorderRepresentation}${leftSpacesBottom}${bottom}${titleBorderRepresentation}\n`;
    let titleBottomLines = `${spaceLine}\n${spaceLine}\n${spaceLine}\n${spaceLine}\n${bottomLine}${spaceLine}\n${spaceLine}\n${boarderLine}`;
    // Output
    console.log(titleTopLines);
    printAssetLines(middle);
    console.log(titleBottomLines);
    printGamestatLines(gameData, clientID); //Print Gamestats     
}

// Build and output the game scene
export function game(gameData, clientID) {
    console.clear(); // Clear terminal for next frame
    // Predefined: gameData, clientID, config.gridHeight, config.gridWidth, gridBorderRepresentation, tmpClientRepresentation, client1Representation , client2Representation, consumableRepresentation
    if (!gameData) return;
    const state = JSON.parse(gameData); // Parse the JSON gameData from the server
    if (!state || !state[clientID]) return; // Ensure we have valid client ID and state for that client

    // Build the game grid, walls and make sure the clients are represented
    const grid = Array.from({ length: config.gridHeight }, (_, i) =>
        Array.from({ length: config.gridWidth }, (__, j) => {
            if (i === 0 || i === config.gridHeight - 1 || j === 0 || j === config.gridWidth - 1) return gridBorderRepresentation; // Boundary walls
            for (let player of Object.keys(state)) { // Iterate over all players
                for (let segment of state[player].position) { // Check if the current position is part of any client
                    if (segment.x === j && segment.y === i) {
                        if (state[player].position.indexOf(segment) === 0) {
                            tmpClientRepresentation = player == clientID ? client1Representation : client2Representation; // Head representation
                        } else {
                            tmpClientRepresentation = player == clientID ? client1TailRepresentation : client2TailRepresentation; // Tail representation
                        }
                        return tmpClientRepresentation; // Return the clients/players                        
                    }
                }
            }
            return ' '; // Default to empty space
        })
    );

    grid[state[clientID].consumable.y][state[clientID].consumable.x] = consumableRepresentation; // Mark the consumable position    
    // Output the game in console
    console.log(grid.map(row => row.join('')).join('\n'));
    printGamestatLines(gameData, clientID); // Print Gamestats    
}