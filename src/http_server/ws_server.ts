import { WebSocketServer, WebSocket } from "ws";

import { registerPlayer, getWinners, addWin } from "./players";
import {
  createRoomForUser,
  addUserToRoom,
  getOpenRooms,
  type RoomUser,
} from "./rooms";
import {
  createGameForRoom,
  setShipsForPlayer,
  getRandomTarget,
  processAttack,
  type Ship,
} from "./games";

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

    if (!msg.type) {
      console.warn("Message without type:", msg);
      return;
    }
    //handle incoming messages
        
          switch (msg.type) {
            case "reg":
              handleReg(ws, msg);
              break;
            case "create_room":
              handleCreateRoom(ws);
              break;
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
            case "single_play":
                  // TODO: play with bot logic
                  break;
            default:
              console.warn("Unknown type:", msg.type);
          }
        }
        // registration handler

        

        function handleReg(ws: WebSocket, msg: Message) {
          
          const payload = typeof msg.data === "string" ? JSON.parse(msg.data) : msg.data;
          
          const { name, password } = payload;
          const { player, error, errorText } = registerPlayer(name, password);
        
          const responseData = {
            name,
            index: name,      // пока используем name как index
            error,
            errorText,
          };
          const response = {
            type: "reg",
            data: JSON.stringify(responseData),
            id: 0,
          };
        
          send(ws, response);
        
          if (!error && player) {
           // сохраняем игрока в мапы
            connections.set(ws, { name, index: name });
            playersByIndex.set(name, ws);
        
          
            const winners = getWinners();
            const update = {
              type: "update_winners",
              data: JSON.stringify(winners),
              id: 0,
            };
        
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
    data: JSON.stringify(roomsData),
    id: 0,
  });
}
function handleAddUserToRoom(ws: WebSocket, msg: Message) {
  console.log("handleAddUserToRoom raw:", msg);

  const conn = connections.get(ws);
  if (!conn) {
    console.warn("handleAddUserToRoom: no connection for ws");
    return;
  }

  // data приходит строкой -> парсим
  const payload = typeof msg.data === "string" ? JSON.parse(msg.data) : msg.data;
  const { indexRoom } = payload;

  console.log("add_user_to_room payload:", payload);

  // добавляем второго пользователя в комнату
  const room = addUserToRoom(String(indexRoom), {
    name: conn.name,
    index: conn.index,
  });

  if (!room) {
    console.warn("Room not found:", indexRoom);
    return;
  }

  console.log("Room after addUserToRoom:", room);

  // создаём игру на основе комнаты (в ней теперь 2 пользователя)
  const game = createGameForRoom(room);
  console.log("Game created:", game);

  // каждому игроку отправляем create_game
  game.players.forEach((gp) => {
    const wsForPlayer = playersByIndex.get(gp.index);
    if (!wsForPlayer) {
      console.warn("No ws for player index:", gp.index);
      return;
    }

    // запоминаем сокет по idPlayer
    socketsByGamePlayerId.set(gp.idPlayer, wsForPlayer);

    const createGameMsg = {
      type: "create_game",
      data: JSON.stringify({
        idGame: game.idGame,
        idPlayer: gp.idPlayer,
      }),
      id: 0,
    };

    send(wsForPlayer, createGameMsg);
  });

  // пересчёт открытых комнат (где только 1 игрок)
  const roomsData = getOpenRooms();

  const updateRooms = {
    type: "update_room",
    data: JSON.stringify(roomsData),
    id: 0,
  };

  broadcast(updateRooms);
}
function handleAddShips(ws: WebSocket, msg: Message) {
  // 1. data приходит строкой -> парсим ОДИН РАЗ
  const payload = typeof msg.data === "string" ? JSON.parse(msg.data) : msg.data;

  const { gameId, ships, indexPlayer } = payload as {
    gameId: string;
    ships: Ship[];
    indexPlayer: string;
  };

  console.log("handleAddShips payload:", payload);

  let gameResult;
  try {
    // 2. ПЕРЕДАЁМ ИМЕННО gameId из payload, а не msg.data
    gameResult = setShipsForPlayer(gameId, indexPlayer, ships);
  } catch (e) {
    console.error("setShipsForPlayer error:", e);
    return;
  }

  const { game, readyPlayers } = gameResult;

  // 3. если оба игрока прислали корабли
  if (readyPlayers.length === game.players.length) {
    // start_game каждому
    game.players.forEach((p) => {
      const playerWs = socketsByGamePlayerId.get(p.idPlayer);
      if (!playerWs) return;

      const startMessage = {
        type: "start_game",
        data: JSON.stringify({
          ships: game.stateByPlayer[p.idPlayer].ships, // только свои корабли
          currentPlayerIndex: game.currentPlayer,      // idPlayer, кто ходит первым
        }),
        id: 0,
      };

      send(playerWs, startMessage);
    });

    // и сразу turn
    const turnMessage = {
      type: "turn",
      data: JSON.stringify({
        currentPlayer: game.currentPlayer,
      }),
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
  // data может быть строкой -> парсим
  const payload = typeof msg.data === "string" ? JSON.parse(msg.data) : msg.data;
  const { gameId, x, y, indexPlayer } = payload as {
    gameId: string;
    x: number;
    y: number;
    indexPlayer: string; // idPlayer в игре
  };

  let attackResult;
  try {
    attackResult = processAttack(gameId, indexPlayer, x, y);
  } catch (e) {
    console.error("processAttack error:", e);
    return;
  }

  const { game, results, winnerId } = attackResult;

  // 1. отправляем attack всем участникам игры
  results.forEach((r) => {
    const attackMessage = {
      type: "attack",
      data: JSON.stringify({
        position: { x: r.x, y: r.y },
        currentPlayer: indexPlayer, // кто стрелял
        status: r.status,
      }),
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
    data: JSON.stringify({ currentPlayer: game.currentPlayer }),
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
      data: JSON.stringify({ winPlayer: winnerId }),
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
      data: JSON.stringify(winners),
      id: 0,
    };

    broadcast(updateWinnersMessage);
  }
}
function handleRandomAttack(ws: WebSocket, msg: Message) {
  // data приходит строкой -> парсим
  const payload = typeof msg.data === "string" ? JSON.parse(msg.data) : msg.data;
  const { gameId, indexPlayer } = payload as {
    gameId: string;
    indexPlayer: string;
  };

  const { x, y } = getRandomTarget(gameId, indexPlayer);

  // создаём новый msg с координатами выстрела
  const attackMsg: Message = {
    ...msg,
    data: JSON.stringify({ gameId, x, y, indexPlayer }),
  };

  // используем ту же логику, что и обычный attack
  handleAttack(ws, attackMsg);
}

        export default wss;