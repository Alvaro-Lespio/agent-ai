import { Annotation, MessagesAnnotation } from "@langchain/langgraph";


export const MyState = Annotation.Root({
    ...MessagesAnnotation.spec,
    //guardamos los nombres de los archivos que el usuario ha subido
    availableFiles: Annotation<string[]>({
      reducer: (x, y) => [...new Set([...x, ...y])], // Evita duplicados
      default: () => [],
    }),
  });