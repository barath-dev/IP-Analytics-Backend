"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const record_model_1 = require("./models/record.model");
const crypto_1 = require("crypto");
const https = require('https');
const express = require('express');
const app = express();
const cors = require('cors');
const bodyParser = require('body-parser');
const server = https.createServer(app);
const port = 4000;
const DBURL = "http://127.0.0.1:8090/api/";
const POCKETBASE_TOKEN = "0xsnb9i4dfh44jo";
const cert = require('fs').readFileSync("rootCA.crt");
const key = require('fs').readFileSync("rootCA.key");
console.log(cert);
console.log(key);
app.use(cors());
app.use(bodyParser.json());
app.post('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        fetchIPDetails().then((data) => __awaiter(void 0, void 0, void 0, function* () {
            let record = new record_model_1.RecordModel((0, crypto_1.randomUUID)().toString().substring(0, 15), data.ip, data.city, data.region, data.country, data.postal, data.latitude, data.longitude, data.timezone, data.org, req.body.os, req.body.browser, req.body.device, Date.now(), Date.now());
            //save the record to the database
            const res = yield fetch(`${DBURL}collections/IP_Details/records`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    "Authorization": `Bearer ${POCKETBASE_TOKEN}`,
                },
                body: JSON.stringify(record),
            }).then((response) => {
                console.log(response);
            }).catch((error) => {
                console.error(error);
            });
        }));
        res.status(200).send("Record saved successfully");
    }
    catch (error) {
        console.error(error);
        res.status(500).send("Error saving record");
    }
}));
function fetchIPDetails() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const res = yield fetch('https://api.ipify.org?format=json', { cache: "no-store" });
            const data = yield res.json();
            const response = yield axios_1.default.get(`https://ipapi.co/${data.ip}/json/`);
            console.log(response.data);
            return response.data;
        }
        catch (error) {
            console.error(error);
            return null;
        }
    });
}
app.get("/records", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Getting records");
    //get all the records from the database
    const response = yield fetch(`${DBURL}collections/IP_Details/records`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${POCKETBASE_TOKEN}`,
        },
    });
    const data = yield response.json();
    console.log(data);
    res.send(data);
}));
app.get("/stats", (req, res) => {
    console.log("Getting stats");
    //get all the records from the database
    const response = fetch(`${DBURL}collections/IP_Details/records`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${POCKETBASE_TOKEN}`,
        },
    }).then((response) => __awaiter(void 0, void 0, void 0, function* () {
        const data = yield response.json();
        const countryStats = data.reduce((acc, item) => {
            acc[item.country] = acc[item.country] ? acc[item.country] + item.visit_count : 1;
            return acc;
        }, {});
        const orgStats = data.reduce((acc, item) => {
            acc[item.org] = acc[item.org] ? acc[item.org] + 1 : 1;
            return acc;
        }, {});
        const browserStats = data.reduce((acc, item) => {
            acc[item.browser] = acc[item.browser] ? acc[item.browser] + 1 : 1;
            return acc;
        }, {});
        const osStats = data.reduce((acc, item) => {
            acc[item.os] = acc[item.os] ? acc[item.os] + 1 : 1;
            return acc;
        }, {});
        const deviceStats = data.reduce((acc, item) => {
            acc[item.device] = acc[item.device] ? acc[item.device] + 1 : 1;
            return acc;
        }, {});
        const overallStats = {
            totalRecords: data.length,
            totalCountries: Object.keys(countryStats).length,
            totalOrgs: Object.keys(orgStats).length,
            totalBrowsers: Object.keys(browserStats).length,
            totalOS: Object.keys(osStats).length,
            totalDevices: Object.keys(deviceStats).length,
        };
        res.send({ countryStats, orgStats, browserStats, osStats, deviceStats, overallStats });
        res.send({ countryStats, orgStats });
    })).catch((error) => {
        console.error(error);
    });
});
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
