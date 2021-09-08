import { Injectable } from '@angular/core';
import { Player } from './player';

@Injectable({
  providedIn: 'root'
})
export class PlayersService {
  thePlayer: Player = null;
  allPlayers:Player[] = new Array(3);

  constructor() {
    this.thePlayer = new Player("willite01", "Williams", "Ted");

    this.allPlayers[0] = new Player("willite01", "Williams", "Ted");
    this.allPlayers[1] = new Player('ortizda01', "Ortiz", "David");
    this.allPlayers[2] = new Player('yastrca01', 'Yastrzemski', "Carl");

  }

  getAllPlayers(): Player[] {
    return this.allPlayers
  }

  getPlayer(): Player {
    return this.thePlayer;
  }
}
