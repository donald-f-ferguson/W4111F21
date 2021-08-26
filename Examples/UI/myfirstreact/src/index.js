import React from 'react';
import ReactDOM from 'react-dom';
import {Component} from "react";

import MyNavbar from "./MyNavbar";
import BaseballPlayer from "./BaseballPlayer";
import IMDBPerson from "./IMDBPerson";

import {Container} from "react-bootstrap";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";

let x = "Hello"

class App extends Component {
    constructor() {
        super();
        this.state = {
            name: "React",
            showHideDemo1: false,
            showHideDemo2: false
        };
        this.hideComponent = this.hideComponent.bind(this);
    }

    hideComponent(name) {
        console.log(name);
        switch (name) {
            case "showHideDemo1":
                this.setState({ showHideDemo1: !this.state.showHideDemo1 });
                break;
            case "showHideDemo2":
                this.setState({ showHideDemo2: !this.state.showHideDemo2 });
                break;
            default:
                let x = 2;
        }
    }

    render() {
        const { showHideDemo1, showHideDemo2 } = this.state;
        return (
            <div>
                <MyNavbar />
                <hr />
                <Container>
                    <Row>
                        <Col>
                    <button onClick={() => this.hideComponent("showHideDemo1")}>
                        Click to display/hide baseball forms.
                    </button>
                        </Col>
                        <Col>
                    <button onClick={() => this.hideComponent("showHideDemo2")}>
                        Click to display/hide IMDB forms.
                    </button>
                        </Col>
                    </Row>
                </Container>
                <hr />
                {showHideDemo1 && <BaseballPlayer />}
                {showHideDemo2 && <IMDBPerson />}
            </div>
        );
    }
}

// ReactDOM.render(<MyNavbar />, document.getElementById('navbar'))
ReactDOM.render(<App />, document.getElementById("app"));

// ReactDOM.render(<BaseballPlayer />, document.getElementById('baseball-player'));
// ReactDOM.render(<IMDBPerson />, document.getElementById('imdb-person'))

