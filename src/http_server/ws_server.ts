import { WebSocketServer, WebSocket} from "ws";

const ws =  new WebSockeServer({port:3000});

ws.on('connection', (ws) => {
    console.log('client connection');
