import { WebSocketServer, WebSocket} from "ws";

type Message = {
  type: string;
  data: any;
  id: number;
};


const wss =  new WebSocketServer({port:3000});

wss.on('listening', () => {
    console.log('WebSocket server started on port 3000')});
wss.on('connection', (ws:WebSocket) => {
        console.log('Client connected');
        ws.on('message', (raw) => {
          handleMessage(ws, raw.toString());
          });
        
          ws.on('close', () => {
            console.log('Client disconnected');
            
          });
        });
        function handleMessage(ws:WebSocket, raw:string) {
          let msg: Message;
        
          try {
            msg = JSON.parse(raw);
          } catch (e) {
            console.error("Invalid JSON:", raw);
            return;
          }
        
          console.log("Received:", msg);
        
          switch (msg.type) {
            case "reg":
              // TODO: handleReg(ws, msg.data);
              break;
            case "create_room":
              // TODO: handleCreateRoom(ws, msg.data);
              break;
            // ...other types
            default:
              console.warn("Unknown type:", msg.type);
          }
        }
        
        export default wss;