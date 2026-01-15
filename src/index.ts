import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HumanMessage } from "@langchain/core/messages";
import { agentBuilder } from './graph.js';


async function runAgent(userQuestion: string, inputFilePath?: string) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const dataDir = path.join(__dirname, "data-test");

    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    if (inputFilePath) {
        const fileName = path.basename(inputFilePath);
        const destinationPath = path.join(dataDir, fileName);
        try {
            fs.copyFileSync(inputFilePath, destinationPath);
        } catch (error) {
            throw new Error(`It couldn't be copy the file ${fileName}`);
        }
    }

    const filesInFolder = fs.readdirSync(dataDir);

    const availablePaths = filesInFolder.map(file => path.join(dataDir, file));


    try {
        const inputs = {
            messages: [new HumanMessage(userQuestion)],

            availableFiles: availablePaths
        };

        const result = await agentBuilder.invoke(inputs);
        console.log("\nRESPONSE:", result.messages[result.messages.length - 1]?.content);

    } catch (error) {
        throw new Error(`Error in the agent: ${error}`);
    }
}



// Case A: The user do a question and send a file
//runAgent("¿Question?", "./src/data-test/Employer.txt");

// Case B: The user only question (the agent search in the exists files on the folder)

runAgent("Calculate the average salary and standard deviation of salaries broken down by each position");
