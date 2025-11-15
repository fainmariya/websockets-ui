import type { Room } from "./rooms";

export type GamePlayer = {
  idPlayer: string;           // the player's unique id within this game
  name: string;               // login
  index: string | number;     // index from reg 
};

export type Game = {
  idGame: string;
  players: GamePlayer[];      // length 2
  currentPlayer: string;      // idPlayer, whose turn is it now
  finish: boolean;
  // потом сюда добавим: доски, корабли и т.п.
};

const games = new Map<string, Game>();
let lastGameId = 1;

// we create a geme based on the room (the room  already has 2 players)
export function createGameForRoom(room: Room): Game {
  const idGame = String(lastGameId++);

  const players: GamePlayer[] = room.users.map((u, idx) => ({
    idPlayer: `${idGame}-p${idx + 1}`, // for exmpl "1-p1", "1-p2"
    name: u.name,
    index: u.index,
  }));

  const game: Game = {
    idGame,
    players,
    currentPlayer: players[0].idPlayer, // for now, the first player moves first
    finish: false,
  };

  games.set(idGame, game);
  return game;
}

export function getGame(idGame: string): Game | undefined {
  return games.get(idGame);
}