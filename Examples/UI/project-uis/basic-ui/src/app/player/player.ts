export class Player {
  playerID: string;
  nameLast: string;
  nameFirst: string;

  constructor(playerID: string, nameLast: string, nameFirst: string) {
    // super(props);
    this.playerID = playerID;
    this.nameLast = nameLast;
    this.nameFirst = nameFirst;
  }
}
