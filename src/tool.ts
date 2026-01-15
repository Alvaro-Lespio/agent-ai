import path from 'node:path';
import fs from 'fs';
import { PDFParse } from 'pdf-parse';
import { parse } from 'csv-parse/sync';
import { tool } from '@langchain/core/tools';
import { file, z } from 'zod';
import * as aq from "arquero";
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';


export const fileInspectorTool = tool(
    async ({ filePath }: { filePath: string }) => {
        try {
            if (path.extname(filePath) === '.txt') {
                const data = fs.readFileSync(filePath, 'utf8');
                return data;
            }
            if (path.extname(filePath) === '.pdf') {
                const buffer = fs.readFileSync(filePath);
                const uint8 = new Uint8Array(buffer);
                const parser = new PDFParse(uint8);
                const data = parser.getText();
                return (await data).text;
            }
            if (path.extname(filePath) === '.csv') {
                const content = fs.readFileSync(filePath, 'utf8');
                const records = parse(content, {
                    columns: true,
                    skip_empty_lines: true
                }) as Record<string, string>[];
                const documents = records.map(r => ({
                    pageContent: Object.entries(r)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(', ')
                }));
                return JSON.stringify(documents);
            }
        } catch (err) {
            console.error(err);
        }

    },
    {
        name: "file_inspector",
        description: "It parses files and returns their contents. If it's CSV, it returns a list of structured rows. If it's PDF or TXT, it returns the plain text.",
        schema: z.object({
            filePath: z.string(),
        }),
    },
);

export const dataQueryEngineTool = tool(
    async ({ queryCode, filePath }) => {
        const ext = path.extname(filePath).toLowerCase();
        console.log("I USED DATA QUERY ENGINE TOOL");
        if (ext !== '.csv' && ext !== '.json') {
            return `ERROR: DataQueryEngine only supports structured files (CSV or JSON). 
                    File "${path.basename(filePath)}" is ${ext}. 
                    For PDFs, read the text with file_inspector and use your logic directly.`;
        }

        try {
            const content = fs.readFileSync(filePath, "utf8");

            let table = ext === '.csv' ? aq.fromCSV(content) : aq.fromJSON(content);

            let cleanCode = queryCode;

            cleanCode = cleanCode.replace(/aq\.op\.std\(/g, 'aq.op.stdev(');
            cleanCode = cleanCode.replace(/aq\.op\.stddev\(/g, 'aq.op.stdev(');
            cleanCode = cleanCode.replace(/\.group_by\(/g, '.groupby(');

            if (cleanCode.includes("Math.sqrt")) {
                return `ERROR: Your code contains 'Math.sqrt()' which is not allowed inside Arquero queries.

                YOUR CODE:
                ${queryCode}

                CORRECTION NEEDED:  
                - Do NOT use Math.sqrt() or other JavaScript Math functions
                - Do NOT use arrow functions inside rollup()

                Example correct code:
                table.rollup({ std_dev: aq.op.stdev('Amount') })

                Please rewrite your query using only Arquero operations.`;
            }

            const runQuery = new Function("table", "aq", `
                try {
                    return (${cleanCode})(table);
                } catch (e) {
                    throw e;
                }
            `);

            const result = runQuery(table, aq);

            if (result && typeof result.print === 'function') {
                return `QUERY SUCCESSFUL: \n${result.print()} `;
            } else if (result && typeof result.objects === 'function') {
                return `QUERY SUCCESSFUL: \n${JSON.stringify(result.objects(), null, 2)} `;
            } else {
                return `QUERY SUCCESSFUL: \n${JSON.stringify(result, null, 2)} `;
            }

        } catch (error: any) {
            return `ERROR IN ARQUERO QUERY:

YOUR CODE:
${queryCode}

ERROR MESSAGE:
${error.message}

COMMON FIXES:
1. For standard deviation use ONLY: aq.op.stdev('ColumnName')
2. Do NOT use arrow functions() => ... inside rollup
3. Do NOT use Math.sqrt or other Math functions
4. Use.groupby() not.group_by()
5. Check column names match exactly(case -sensitive)

Please try again with corrected syntax.`;
        }
    },
    {
        name: "data_query_engine",
        description: `Make stadistical analysis and complex filters in files CSV / JSON using Arquero.js.
    Recive a 'queryCode' which is a anonymous function of JS.
        Example: (table) => table.filter(d => d.sueldo > 1000).rollup({ total: aq.op.sum('sueldo') })`,
        schema: z.object({
            queryCode: z.string().describe("The script of JS/Arquero to execute"),
            filePath: z.string().describe("Route of file CSV or JSON")
        }),
    }
);
export const documentDeepAnalyst = tool(
    async ({ filePath, query }: { filePath: string, query: string }) => {
        try {
            let data = '';
            const ext = path.extname(filePath).toLowerCase();
            if (ext !== '.pdf' && ext !== '.txt') {
                return `ERROR: documentDeepAnalyst only admite structured files(PDF or TXT).
    File "${path.basename(filePath)}" is ${ext}.`;
            }
            if (ext === '.pdf') {
                const buffer = fs.readFileSync(filePath);
                const unit8Pdf = new Uint8Array(buffer);
                const parser = new PDFParse(unit8Pdf);
                const parsed = await parser.getText();
                data = parsed.text;
            }
            if (ext === '.txt') {
                data = fs.readFileSync(filePath, 'utf8');
            }

            const text_splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
            const chunks = await text_splitter.createDocuments([data]);

            const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);

            const scoredChunks = chunks.map(chunk => {
                let score = 0;
                const content = chunk.pageContent.toLowerCase();
                queryWords.forEach(word => {
                    if (content.includes(word)) score++;
                });
                return { content: chunk.pageContent, score };
            });

            const relevantResults = scoredChunks
                .filter(c => c.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 4);

            if (relevantResults.length === 0) {
                return "Not found specific information about that topic. try using different words.";
            }
            const output = relevantResults.map((r, i) => `[RESULTADO ${i + 1}]: ${r.content} `).join("\n\n");

            return `I found this fragments in the file: \n\n${output} `;
        } catch (error: any) {
            return `Error when analyze document: ${error.message} `;
        }
    },
    {
        name: "document_deep_analyst",
        description: "Deep analyze on files PDF and TXT. Search and extract specifics paragraphs based in a query. Use for long documets where the file_inspecto don't show all information.",
        schema: z.object({
            filePath: z.string().describe("Path of file PDF or TXT"),
            query: z.string().describe("The question or keywords for search specific information")
        }),
    }

)

export const tools = [fileInspectorTool, dataQueryEngineTool, documentDeepAnalyst];


