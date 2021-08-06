import React from 'react';
// import ReactDOM from 'react-dom';

import {Container} from "react-bootstrap";
import Row from "react-bootstrap/Row";
import {Col} from "react-bootstrap";


class IMDBPerson extends React.Component {
    render() {
        return (
            <Container fluid>
                <hr />
                <Row>
                    <Col>"Hello from a person."</Col>
                    <Col>"Hello from a person."</Col>
                </Row>
            </Container>
        );
    }
}
export default IMDBPerson;
