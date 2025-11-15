import { WebSocketServer, WebSocket} from "ws";
import { registerPlayer, getWinners, addWin } from "./players";
import { createRoomForUser, addUserToRoom, getOpenRooms, RoomUser } from "./rooms";
import { createGameForRoom, setShipsForPlayer, Game, Ship, getRandomTarget } from "./games";
import { processAttack } from "./games";


type Message = {
  type: string;
  data: any;
  id: number;
};


const wss =  new WebSocketServer({port:3000});
const connections = new Map<WebSocket, { name: string; index: string | number }>();
const playersByIndex = new Map<string | number, WebSocket>(); // index -> ws
const socketsByGamePlayerId = new Map<string, WebSocket>();

function send(ws, message) {
  const json = JSON.stringify(message);
  console.log("Send:", json);
  ws.send(json);
}
function broadcast(message: any) {
  const json = JSON.stringify(message);
  console.log("Broadcast:", json);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  });
}

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
              handleReg(ws, msg);
              break;
            case "create_room":
              handleCreateRoom(ws);
            case "add_user_to_room":
              handleAddUserToRoom(ws, msg);
              break;
            case "add_ships":
                handleAddShips(ws, msg);
                break;
            case "attack":
                handleAttack(ws, msg);
                break;
            case "randomAttack":
                handleRandomAttack(ws, msg);
                break;
            default:
              console.warn("Unknown type:", msg.type);
          }
        }
        // registration handler

        

function handleReg(ws: WebSocket, msg: Message) {
  const { name, password } = msg.data;

  const { player, error, errorText } = registerPlayer(name, password);

  const response = {
    type: "reg",
    data: {
      name,
      index: name, // пока можно использовать name как index
      error,
      errorText,
    },
    id: 0,
  };

  

  send(ws, response)

  // after a successful registration< send the winnwer's table
  if (!error) {
    const winners = getWinners();
    const update = {
      type: "update_winners",
      data: winners,
      id: 0,
    };

    // send it to all connected users
    wss.clients.forEach((client) => {
      if (client.readyState === client.OPEN) {
        send(client as WebSocket, update);
      }
    });
  }
}

function handleCreateRoom(ws: WebSocket) {
  const conn = connections.get(ws);
  if (!conn) return;

  const user: RoomUser = {
    name: conn.name,
    index: conn.index,
  };

  createRoomForUser(user);

  // after creating a room, send update_room to everyone
  const roomsData = getOpenRooms();

  broadcast({
    type: "update_room",
    data: roomsData,
    id: 0,
  });
}
function handleAddUserToRoom(ws: WebSocket, msg: Message) {
  
    const conn = connections.get(ws);
    if (!conn) return;
  
    const { indexRoom } = msg.data;
  
    const room = addUserToRoom(String(indexRoom), {
      name: conn.name,
      index: conn.index,
    });
  
    if (!room) return;
  
    // создаём игру на основе комнаты
    const game = createGameForRoom(room);
  
    // для каждого игрока игры запоминаем ws по его index
    game.players.forEach((gp) => {
      const wsForPlayer = playersByIndex.get(gp.index);
      if (!wsForPlayer) return;
  
      // сохраняем соответствие idPlayer -> ws
      socketsByGamePlayerId.set(gp.idPlayer, wsForPlayer);
  
      // отправляем create_game
      const response = {
        type: "create_game",
        data: {
          idGame: game.idGame,
          idPlayer: gp.idPlayer,
        },
        id: 0,
      };
  
      send(wsForPlayer, response);
    });
  
    // update the list ov available rooms
  const roomsData = getOpenRooms();

  broadcast({
    type: "update_room",
    data: roomsData,
    id: 0,
  });
  }
  
  function handleAddShips(ws: WebSocket, msg: Message) {
    const { gameId, ships, indexPlayer } = msg.data as {
      gameId: string;
      ships: Ship[];
      indexPlayer: string; // это idPlayer в рамках игры
    };
  
    // 1–3 шаг: найти игру, найти GamePlayerState, сохранить ships + board
    const { game, readyPlayers } = setShipsForPlayer(gameId, indexPlayer, ships);
  
    // 4. когда оба игрока прислали корабли → отправляем start_game каждому
    if (readyPlayers.length === game.players.length) {
      // отправляем start_game каждому игроку
      game.players.forEach((p) => {
        const playerWs = socketsByGamePlayerId.get(p.idPlayer);
        if (!playerWs) return;
  
        const startMessage = {
          type: "start_game",
          data: {
            // отправляем только его корабли
            ships: game.stateByPlayer[p.idPlayer].ships,
            currentPlayerIndex: game.currentPlayer, // idPlayer, кто ходит первым
          },
          id: 0,
        };
  
        send(playerWs, startMessage);
      });
  
      // 5. также сразу отправляем turn для обоих
      const turnMessage = {
        type: "turn",
        data: { currentPlayer: game.currentPlayer },
        id: 0,
      };
  
      game.players.forEach((p) => {
        const playerWs = socketsByGamePlayerId.get(p.idPlayer);
        if (!playerWs) return;
        send(playerWs, turnMessage);
      });
    }
  }
  
  function handleAttack(ws: WebSocket, msg: Message) {
    const { gameId, x, y, indexPlayer } = msg.data as {
      gameId: string;
      x: number;
      y: number;
      indexPlayer: string; // idPlayer в игре
    };
  
    let attackResult;
    try {
      attackResult = processAttack(gameId, indexPlayer, x, y);
    } catch (e) {
      console.error(e);
      return;
    }
  
    const { game, results, winnerId } = attackResult;
  
    // 1. отправляем attack всем участникам игры
    results.forEach((r) => {
      const attackMessage = {
        type: "attack",
        data: {
          position: { x: r.x, y: r.y },
          currentPlayer: indexPlayer, // кто стрелял
          status: r.status,
        },
        id: 0,
      };
  
      game.players.forEach((p) => {
        const playerWs = socketsByGamePlayerId.get(p.idPlayer);
        if (!playerWs) return;
        send(playerWs, attackMessage);
      });
    });
  
    // 2. определяем, чей следующий ход
    const last = results[0]; // основная клетка выстрела
    if (last.status === "miss") {
      // смена хода
      const other = game.players.find((p) => p.idPlayer !== indexPlayer);
      if (other) {
        game.currentPlayer = other.idPlayer;
      }
    } else {
      // shot или killed — тот же игрок стреляет снова
      game.currentPlayer = indexPlayer;
    }
  
    // отправляем turn всем
    const turnMessage = {
      type: "turn",
      data: { currentPlayer: game.currentPlayer },
      id: 0,
    };
  
    game.players.forEach((p) => {
      const playerWs = socketsByGamePlayerId.get(p.idPlayer);
      if (!playerWs) return;
      send(playerWs, turnMessage);
    });
  
    // 3. проверяем победу
    if (winnerId) {
      const finishMessage = {
        type: "finish",
        data: { winPlayer: winnerId },
        id: 0,
      };
  
      game.players.forEach((p) => {
        const playerWs = socketsByGamePlayerId.get(p.idPlayer);
        if (!playerWs) return;
        send(playerWs, finishMessage);
      });
  
      // обновляем победы
      const winner = game.players.find((p) => p.idPlayer === winnerId);
      if (winner) {
        addWin(winner.name);
      }
  
      const winners = getWinners();
      const updateWinnersMessage = {
        type: "update_winners",
        data: winners,
        id: 0,
      };
  
      broadcast(updateWinnersMessage);
    }
  }
  function handleRandomAttack(ws: WebSocket, msg: Message) {
    const { gameId, indexPlayer } = msg.data as {
      gameId: string;
      indexPlayer: string;
    };
  
    const { x, y } = getRandomTarget(gameId, indexPlayer);
  
    // просто используем ту же логику, что и обычный attack
    handleAttack(ws, {
      ...msg,
      data: { gameId, x, y, indexPlayer },
    });
  }

        export default wss;