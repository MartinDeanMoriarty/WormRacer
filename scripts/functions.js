import fs from 'fs';
const textAsset = JSON.parse(fs.readFileSync('./assets/text.json', 'utf8')); // Load text asset

// Generate NOT SO UNIQUE identifier
export function generateUniqueIdentifier(clientIdent) {    
    return clientIdent; // Just something simple for testing
}

// Used to quit to terminal after an error. 'restart' is not in use yet!
export function processPrompt(stdin, process, rl, action, text) {
    switch (action) {
        case 'exit':
            console.log(`\n${text}`);
            stdin.once('data', () => {
                process.exit(0); // Exit gracefully if the user presses Enter
            });
            break;
        case 'restart':
            rl.question(`\n${text}`, (answer) => {
                if (answer.trim() !== '') return; // If anything is entered, do nothing and let the function exit naturally
                process.exit(0); // Exit gracefully if Enter is pressed without any input
            });
            break;
        default:
            console.log(`\n${textAsset.promtErrorMessage}`); 
    }
}

// Clamp a value
export function clamp(value, min, max) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}