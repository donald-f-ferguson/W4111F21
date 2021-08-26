import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ImdbArtist } from "./imdbartist";
import { Observable } from "rxjs";


@Injectable({
  providedIn: 'root'
})
export class ImdbServiceService {

  imdbArtists : ImdbArtist[];
  imdbUrl : string;

  constructor(private http: HttpClient) {
    this.imdbArtists = undefined;
    this.imdbUrl = "http://127.0.0.1:5000/imdb/artists/"
  }

  /** GET heroes from the server */
  getArtists(artistName): Observable<ImdbArtist[]> {
    var theUrl: string;

    theUrl = this.imdbUrl + artistName;
    return this.http.get<ImdbArtist[]>(theUrl)
  }
}
