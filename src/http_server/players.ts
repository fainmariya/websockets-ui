export type Player = {
    name: string;
    password: string;
    wins: number;
  };

  const players = new Map<string, Player>(); // key = name

  // registration / login
export function registerPlayer(name: string, password: string) {
    const existing = players.get(name);
    if (!existing) {
        // create a new player
        const newPlayer: Player = { name, password, wins: 0 };
        players.set(name, newPlayer);
    
        return {
          player: newPlayer,
          error: false,
          errorText: "",
        };
      }
    
      if (existing.password !== password) {
        return {
          player: null,
          error: true,
          errorText: "Wrong password",
        };
      }
    
      return {
        player: existing,
        error: false,
        errorText: "",
      };
    }
    
    // return the winners table 
    export function getWinners() {
      return Array.from(players.values()).map((p) => ({
        name: p.name,
        wins: p.wins,
      }));
    }
    
    // increase the number of victorie
    export function addWin(name: string) {
      const player = players.get(name);
      if (player) {
        player.wins += 1;
      }
    }