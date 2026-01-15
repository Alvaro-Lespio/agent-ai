import { MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage } from "@langchain/core/messages";
import { dataQueryEngineTool, documentDeepAnalyst, fileInspectorTool, tools } from './tool.js';
import { ChatOpenAI } from "@langchain/openai";
import { MyState } from './state.js'

const llm = new ChatOpenAI({
  apiKey: "lm-studio",
  configuration: {
    baseURL: "http://127.0.0.1:1234/v1",
  },
  modelName: "lmstudio-community/Qwen2.5-7B-Instruct-1M-GGUF",
  temperature: 0,
});
const llmWithTools = llm.bindTools([fileInspectorTool, dataQueryEngineTool, documentDeepAnalyst]);




//Nodes
async function llmCall(state: typeof MyState.State) {

  const result = await llmWithTools.invoke([
    {
      role: "system",
      content: `You are a Data Analyst.

FILES: [${state.availableFiles.join(", ")}]

RULES:
MANDATORY STEPS:
1. Use 'file_inspector' to see the exact column names.
2. For calculations, use 'data_query_engine'.
3. COPY the column names exactly (e.g., if the inspector says 'Salary', don't type 'salary').
CRITICAL: Read tool error messages CAREFULLY and fix the EXACT issue mentioned.

MANDATORY WORKFLOW:
1. ALWAYS use 'file_inspector' FIRST to see exact column names
2. For calculations, use 'data_query_engine' with the EXACT column names from step 1
3. If a tool returns an ERROR, you MUST change your approach - do NOT retry the same code

ARQUERO SYNTAX (data_query_engine):
✅ CORRECT order: table.groupby('Column').rollup({ metric: aq.op.mean('Value') })
❌ WRONG order: table.rollup({ ... }).groupby('Column')

✅ Standard deviation: aq.op.stdev('ColumnName')
❌ NEVER use: Math.sqrt, aq.op.std, aq.op.stddev

VALID EXAMPLES:
- Average: (table) => table.rollup({ avg: aq.op.mean('Sueldo') })
- Group stats: (table) => table.groupby('Puesto').rollup({ avg: aq.op.mean('Sueldo'), std: aq.op.stdev('Sueldo') })
- Filter: (table) => table.filter(d => d.Puesto === 'Desarrollador').rollup({ total: aq.op.sum('Sueldo') })
- Count: (table) => table.groupby('Puesto').rollup({ count: aq.op.count() })

IMPORTANT: 
- If you see [DATA] in a previous message, you ALREADY have the answer - respond directly
- Match column names EXACTLY (case-sensitive)
- After 2 failed attempts with a tool, explain the issue to the user instead of retrying

- If you need to view a file, use 'file_inspector'.

- For calculations in CSV, use 'data_query_engine' with Archer: (table) => table...

- To search in long PDFs/TXTs, use 'document_deep_analyst'.

- If the message above says [DATA], YOU ALREADY HAVE THE INFORMATION. Don't ask for it again. Respond directly.
- Never use placeholders like [DATA] - always use the actual numbers

EXTREMADAMENTE IMPORTANTE:
  Tu respuesta debe ser ÚNICAMENTE el valor final solicitado (número, código o nombre). 
  No incluyas explicaciones, ni unidades (como USD), ni frases como 'La respuesta es'.
`
    },
    ...state.messages
  ]);
  return {
    messages: [result]
  };

}
const toolNode = new ToolNode(tools);


function shouldContinue(state: typeof MessagesAnnotation.State) {
  const { messages } = state;
  const lastMessage = messages[messages.length - 1] as AIMessage;

  if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    return "toolNode";
  }
  return "__end__";
}


export const agentBuilder = new StateGraph(MyState)
  .addNode("llmCall", llmCall)
  .addNode("toolNode", toolNode)

  .addEdge("__start__", "llmCall")
  .addConditionalEdges(
    "llmCall",
    shouldContinue,
    ["toolNode", "__end__"]
  )
  .addEdge("toolNode", "llmCall")
  .compile();

