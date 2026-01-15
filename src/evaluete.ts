import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import { agentBuilder } from './graph.js';
import { HumanMessage } from "@langchain/core/messages";
import * as dotenv from 'dotenv';
const API_BASE = "https://huggingface.co/spaces/gaia-benchmark/leaderboard"; // Ajustar según la URL del curso


dotenv.config();

const HF_TOKEN = process.env.HF_TOKEN;

if (!HF_TOKEN) {
    throw new Error("❌ No se encontró el HF_TOKEN en el archivo .env");
}




async function runEvaluation() {
    // 1. Obtener una pregunta de la API
    const response = await axios.get(`${API_BASE}/random-question`, {
        headers: { Authorization: `Bearer ${HF_TOKEN}` }
    });

    const { task_id, question, file_name } = response.data;
    console.log(`📝 Pregunta [${task_id}]: ${question}`);

    let availableFiles: string[] = [];

    // 2. Si la tarea tiene archivo, descargarlo
    if (file_name) {
        const fileRes = await axios.get(`${API_BASE}/files/${task_id}`, {
            responseType: 'arraybuffer',
            headers: { Authorization: `Bearer ${HF_TOKEN}` }
        });

        const dataDir = path.join(process.cwd(), 'data-test');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

        const filePath = path.join(dataDir, file_name);
        fs.writeFileSync(filePath, Buffer.from(fileRes.data));
        availableFiles = [filePath];
        console.log(`📂 Archivo descargado: ${file_name}`);
    }

    // 3. Ejecutar tu Agente
    const result = await agentBuilder.invoke({
        messages: [new HumanMessage(question)],
        availableFiles: availableFiles
    }, { recursionLimit: 50 });

    if (!result.messages || result.messages.length === 0) {
        throw new Error("El agente no devolvió ningún mensaje.");
    }

    const lastMessage = result.messages[result.messages.length - 1];
    const finalAnswer = (typeof lastMessage?.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage?.content)
    ).trim();
    console.log(`🤖 Respuesta del Agente: "${finalAnswer}"`);

    // 4. Enviar para calificar
    const submitRes = await axios.post(`${API_BASE}/submit`, {
        task_id: task_id,
        answer: finalAnswer
    }, {
        headers: { Authorization: `Bearer ${HF_TOKEN}` }
    });

    console.log("🏆 Resultado:", submitRes.data.correct ? "✅ CORRECTO" : "❌ INCORRECTO");
    console.log("📊 Tu Score actual:", submitRes.data.score);
}

runEvaluation();