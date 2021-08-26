import { Component, OnInit } from '@angular/core';
import { PlayersService } from "./players.service";
import { Player } from "./player";


@Component({
  selector: 'app-player-component',
  templateUrl: './player.component.html',
  styleUrls: ['./player.component.css']
})
export class PlayerComponent implements OnInit {
  currentPlayer: Player;
  allPlayers: Player[];
  testInp : string;
  showPlayers = false;

  constructor(playerService: PlayersService) {
    this.currentPlayer = playerService.getPlayer();
    this.allPlayers = playerService.getAllPlayers();
    this.testInp = undefined;
  }

  ngOnInit(): void {
  }

  onSomethingInput(e: Event) : void {
    console.log("Input = ", (<HTMLInputElement> e.target).value);
    this.testInp = (<HTMLInputElement> e.target).value;
  }

  togglePlayers(): void {
    this.showPlayers = !this.showPlayers;
  }

}
