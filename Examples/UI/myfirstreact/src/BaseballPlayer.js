import React from 'react';
// import ReactDOM from 'react-dom';

import {Container} from "react-bootstrap";
import Row from "react-bootstrap/Row";
import {Col} from "react-bootstrap";
import axios from "axios";
import BootstrapTable  from "react-bootstrap-table-next";

let columns = [{
    dataField: 'playerId',
    text: 'Player ID'
}, {
    dataField: 'nameLast',
    text: 'Last Name'
}, {
    dataField: 'nameFirst',
    text: 'First Name'
}];

let players = [
        {playerId: 1, nameLast: 'Cat', nameFirst: '1'},
        {playerId: 2, nameLast: 'Dog', nameFirst: '1'},

    ]

class BaseballPlayerForm extends React.Component {
    constructor(props) {
        super(props);
        this.state = { username: '', player_lastname: null, players_list: [] };
    }
    static getDerivedStateFromProps(props, state) {
        return {username: props.username };
    }
    myChangeHandler = (event) => {
        console.log(event.target.id);
        console.log(event.target.value);
        this.setState({player_lastname: event.target.value, username: this.state.username});
        this.state.player_lastname = event.target.value;
        console.log("Player last name = ", this.state.player_lastname);
        if (this.state.player_lastname.length > 3) {
            axios.get('http://localhost:5000/lahman2019raw/people/nameLast/' + this.state.player_lastname)
                .then(response=> {
                    // handle success
                    this.state.players_list = response.data;
                    console.log(this.state.players_list);

                    let pl = response.data;

                    let tmp = []
                    pl.forEach((element, index, array) => {
                       tmp.push(
                            {
                                playerId: element.playerID,
                                nameLast: element.nameLast,
                                nameFirst: element.nameFirst
                            }
                        )
                    this.setState({players_list: tmp})
                        // console.log(element.x); // 100, 200, 300
                        // console.log(index); // 0, 1, 2
                        // console.log(array); // same myArray object 3 times
                    });
                })
                .catch(function (error) {
                    // handle error
                    console.log(error);
                })
                .then(function () {
                    // always executed
                });
        }
    }
    render() {
        return (
            <form>
                <h1>Welcome, {this.state.username} -- Search for a player by last name. </h1>
                <Container>
                    <Row>
                        <Col>
                <p>Enter the player's name:</p>
                            </Col>
                        <Col>
                <input
                    id={"playerLastName"}
                    type='text'
                    onChange={this.myChangeHandler}
                />
                        </Col>
                    </Row>
                    <Row>
                        <BootstrapTable keyField='playerId' data={ this.state.players_list } columns={ columns } />
                    </Row>
                </Container>
            </form>
        );
    }
}


class BaseballPlayer extends React.Component {
    render() {
        return (
            <Container fluid>
                <hr />
                <Row>
                    <BaseballPlayerForm username="Donald Ferguson"/>
                </Row>
            </Container>
        );
    }
}
export default BaseballPlayer;
