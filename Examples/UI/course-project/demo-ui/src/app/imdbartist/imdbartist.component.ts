import { Component, OnInit } from '@angular/core';
import { ImdbServiceService } from "./imdb-service.service";
import {ImdbArtist} from "./imdbartist";

@Component({
  selector: 'app-imdbartist',
  templateUrl: './imdbartist.component.html',
  styleUrls: ['./imdbartist.component.css']
})
export class ImdbartistComponent implements OnInit {

  toggleImdb : boolean;
  artistName : string;
  imdbService : ImdbServiceService;
  artistInfo : ImdbArtist[];

  constructor(imdbService: ImdbServiceService) {
    this.toggleImdb = false
    this.artistName = undefined;
    this.imdbService = imdbService;
    this.artistInfo = undefined;
  }

  ngOnInit(): void {
  }

  toggleCard (): void {
    this.toggleImdb = !this.toggleImdb;
  }

  setArtistInfo(theArtists: ImdbArtist[]) {
    console.log("Artists = \n" + JSON.stringify(theArtists, null, 2));
    this.artistInfo = theArtists;
  }


  onSomethingInput(e: Event) : void {
    // console.log("Input = ", (<HTMLInputElement> e.target).value);
    this.artistName = (<HTMLInputElement> e.target).value;
    if (this.artistName.length > 5) {
      this.imdbService.getArtists(this.artistName)
        .subscribe((data) => this.setArtistInfo(data));
    }
  }

  onLookup(): void {
    if (this.artistName.length > 5) {
      this.imdbService.getArtists(this.artistName)
        .subscribe((data) => this.setArtistInfo(data));
    }
  }

}
