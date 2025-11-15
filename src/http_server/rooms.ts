


export type RoomUser= {
    name: string;
    index: string | number; // id player(from reg)
  };
  
  export type Room = {
    roomId: string;      
    users: RoomUser[];   // 1 or 2 players
  };

  const rooms: Map<string, Room> = new Map<string, Room>();
let lastRoomId = 1;

//create new room with one user
export function createRoomForUser(user: RoomUser): Room {
    const roomId = String(lastRoomId++);
  
    const room: Room = {
      roomId,
      users: [user],
    };
  
    rooms.set(roomId, room);
    return room;
  };
  // to add user to the room
export function addUserToRoom(roomId: string, user: RoomUser): Room | null {
    const room = rooms.get(roomId);
    if (!room) {
      return null;
    }
  
    room.users.push(user);
    return room;
  }
  
  // return the list of open rooms that have only one player
  export function getOpenRooms() {
    return Array.from(rooms.values())
      .filter((room) => room.users.length === 1)
      .map((room) => ({
        roomId: room.roomId,
        roomUsers: room.users.map((u) => ({
          name: u.name,
          index: u.index,
        })),
      }));
  }