// src/http_server/games.ts
import type { Room } from "./rooms";

const BOARD_SIZE = 10;

export type CellState = "empty" | "ship" | "hit" | "miss";

export type Ship = {
  position: { x: number; y: number };
  direction: boolean; // true = горизонт, false = вертикаль
  length: number;
  type: "small" | "medium" | "large" | "huge";
};

export type GamePlayerState = {
  idPlayer: string;
  ships: Ship[];
  board: CellState[][];
  aliveShips: number;
};

export type GamePlayer = {
  idPlayer: string;
  name: string;
  index: string | number;
};

export type Game = {
  idGame: string;
  players: GamePlayer[];
  currentPlayer: string; // idPlayer
  finish: boolean;
  stateByPlayer: Record<string, GamePlayerState>;
};

const games = new Map<string, Game>();
let lastGameId = 1;

// ---------- helpers ----------

function createEmptyBoard(): CellState[][] {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => "empty" as CellState)
  );
}

// to find a ship by coordinate
function getShipAt(
    playerState: GamePlayerState,
    x: number,
    y: number
  ): Ship | undefined {
    return playerState.ships.find((ship) => {
      const { position, direction, length } = ship;
      const startX = position.x;
      const startY = position.y;
  
      if (direction) {
        // true = горизонтальный
        if (x !== startX) return false;
        return y >= startY && y < startY + length;
      } else {
        // false = вертикальный
        if (y !== startY) return false;
        return x >= startX && y < startX + length;
      }
    });
  }
  function isShipKilled(
    playerState: GamePlayerState,
    x: number,
    y: number
  ): boolean {
    const ship = getShipAt(playerState, x, y);
    if (!ship) return false;
  
    const { position, direction, length } = ship;
    const startX = position.x;
    const startY = position.y;
  
    for (let i = 0; i < length; i++) {
      const cx = direction ? startX + i : startX;
      const cy = direction ? startY : startY + i;
      if (playerState.board[cy][cx] !== "hit") {
        return false;
      }
    }
  
    return true;
  }
  function markAroundKilledShip(
    playerState: GamePlayerState,
    x: number,
    y: number
  ): { x: number; y: number }[] {
    const ship = getShipAt(playerState, x, y);
    if (!ship) return [];
  
    const { position, direction, length } = ship;
    const startX = position.x;
    const startY = position.y;
  
    let shipMinX: number;
    let shipMaxX: number;
    let shipMinY: number;
    let shipMaxY: number;
  
    if (direction) {
      
      shipMinX = startX;
      shipMaxX = startX ;
      shipMinY = startY;
      shipMaxY = startY + length - 1;
    } else {
   
      shipMinX = startX;
      shipMaxX = startX + length - 1;
      shipMinY = startY;
      shipMaxY = startY;
    }
  
    const height = playerState.board.length;
    const width = height > 0 ? playerState.board[0].length : 0;
  
    const rectMinX = Math.max(0, shipMinX - 1);
    const rectMaxX = Math.min(width - 1, shipMaxX + 1);
    const rectMinY = Math.max(0, shipMinY - 1);
    const rectMaxY = Math.min(height - 1, shipMaxY + 1);
  
    const changed: { x: number; y: number }[] = [];
  
    for (let yy = rectMinY; yy <= rectMaxY; yy++) {
      for (let xx = rectMinX; xx <= rectMaxX; xx++) {
        const insideShip =
          xx >= shipMinX && xx <= shipMaxX && yy >= shipMinY && yy <= shipMaxY;
        if (insideShip) continue;
  
        const cell = playerState.board[yy][xx];
        if (cell === "empty") {
          playerState.board[yy][xx] = "miss";
          changed.push({ x: xx, y: yy });
        }
      }
    }
  
    return changed;
  }
// ---------- game creation ----------

export function createGameForRoom(room: Room): Game {
  const idGame = String(lastGameId++);

  const players: GamePlayer[] = room.users.map((u, idx) => ({
    idPlayer: `${idGame}-p${idx + 1}`,
    name: u.name,
    index: u.index,
  }));

  const stateByPlayer: Record<string, GamePlayerState> = {};

  players.forEach((p) => {
    stateByPlayer[p.idPlayer] = {
      idPlayer: p.idPlayer,
      ships: [],
      board: createEmptyBoard(),
      aliveShips: 0,
    };
  });

  const game: Game = {
    idGame,
    players,
    currentPlayer: players[0].idPlayer,
    finish: false,
    stateByPlayer,
  };

  games.set(idGame, game);
  console.log("createGameForRoom: games keys =", Array.from(games.keys()));

  return game;
}

export function getGame(idGame: string): Game | undefined {
  return games.get(idGame);
}

// ---------- ships placement ----------

export function setShipsForPlayer(
    gameId: string,
    idPlayer: string,
    ships: Ship[]
  ): { game: Game; readyPlayers: string[] } {
    console.log("setShipsForPlayer: gameId =", gameId, "all games =", Array.from(games.keys()));
  
    const game = games.get(gameId);
    if (!game) {
      throw new Error("Game not found");
    }
  
    const playerState = game.stateByPlayer[idPlayer];
    if (!playerState) {
      throw new Error("Player not in game");
    }
  
    // очищаем доску и состояние на всякий случай
    playerState.board = createEmptyBoard();
    playerState.ships = ships;
    playerState.aliveShips = ships.length;
  
    // направление: direction === true -> горизонтальный, false -> вертикальный
    ships.forEach((ship) => {
        const { x, y } = ship.position;
      
        for (let i = 0; i < ship.length; i++) {
          const xx = ship.direction ? x : x + i;  // true = вертикальный
          const yy = ship.direction ? y + i : y;  // false = горизонтальный
      
          playerState.board[yy][xx] = "ship";
        }
      });
  
    const readyPlayers = Object.values(game.stateByPlayer)
      .filter((ps) => ps.ships.length > 0)
      .map((ps) => ps.idPlayer);
  
    console.log(
      "readyPlayers for game",
      game.idGame,
      "=",
      readyPlayers,
      "/ all players =",
      game.players.map((p) => p.idPlayer)
    );
  
    return { game, readyPlayers };
  }
  
// ---------- ATTACK LOGIC ----------

export type AttackStatus = "miss" | "shot" | "killed";

export type AttackCellResult = {
  x: number;
  y: number;
  status: AttackStatus;
};

export type AttackResult = {
  game: Game;
  results: AttackCellResult[]; // основная клетка +, при killed, клетки вокруг
  winnerId?: string;
};

export function processAttack(
  gameId: string,
  attackerId: string,
  x: number,
  y: number
): AttackResult {
  const game = games.get(gameId);
  if (!game) {
    throw new Error("Game not found");
  }

  if (game.currentPlayer !== attackerId) {
    throw new Error("Not attacker turn");
  }

  // ищем защитника (второй игрок)
  const defender = game.players.find((p) => p.idPlayer !== attackerId);
  if (!defender) {
    throw new Error("Defender not found");
  }

  const defenderState = game.stateByPlayer[defender.idPlayer];
  const cell = defenderState.board[y][x];

  const results: AttackCellResult[] = [];

  if (cell === "hit" || cell === "miss") {
    // уже стреляли - считаем как miss, чтобы не ломать игру
    results.push({ x, y, status: "miss" });
  } else if (cell === "empty") {
    defenderState.board[y][x] = "miss";
    results.push({ x, y, status: "miss" });
  } else if (cell === "ship") {
    defenderState.board[y][x] = "hit";

    const killed = isShipKilled(defenderState, x, y);
    if (killed) {
      defenderState.aliveShips -= 1;

      // клетки вокруг корабля = miss
      const around = markAroundKilledShip(defenderState, x, y);
      results.push({ x, y, status: "killed" });
      results.push(
        ...around.map((c) => ({ x: c.x, y: c.y, status: "miss" as AttackStatus }))
      );
    } else {
      results.push({ x, y, status: "shot" });
    }
  }

  let winnerId: string | undefined;
  if (defenderState.aliveShips <= 0) {
    game.finish = true;
    winnerId = attackerId;
  }
  
  return { game, results, winnerId };
}

// ---------- RANDOM TARGET FOR BOT / randomAttack ----------

export function getRandomTarget(
  gameId: string,
  attackerId: string
): { x: number; y: number } {
  const game = games.get(gameId);
  if (!game) {
    throw new Error("Game not found");
  }

  const defender = game.players.find((p) => p.idPlayer !== attackerId);
  if (!defender) {
    throw new Error("Defender not found");
  }

  const defenderState = game.stateByPlayer[defender.idPlayer];

  const available: { x: number; y: number }[] = [];

  for (let yy = 0; yy < defenderState.board.length; yy++) {
    for (let xx = 0; xx < defenderState.board[yy].length; xx++) {
      const c = defenderState.board[yy][xx];
      // можно стрелять только в клетки, куда ещё не стреляли
      if (c !== "hit" && c !== "miss") {
        available.push({ x: xx, y: yy });
      }
    }
  }

  if (!available.length) {
    return { x: 0, y: 0 };
  }

  const idx = Math.floor(Math.random() * available.length);
  return available[idx];
}