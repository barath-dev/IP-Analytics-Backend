import { Request,Response } from "express";
import axios from "axios";
import { RecordModel } from "./models/record.model";
import { randomUUID } from "crypto";

const https = require('https');
const express = require('express');
const app = express();
const cors = require('cors');
const bodyParser = require('body-parser');
const  cert = require('fs').readFileSync("rootCA.crt");
const key = require('fs').readFileSync("rootCA.key");
const port = 4000;
const DBURL = "http://127.0.0.1:8090/api/";
const POCKETBASE_TOKEN = "0xsnb9i4dfh44jo"


//create a https server using key and cert 
const server = https.createServer({key: key, cert: cert }, app);


app.use(cors());
app.use(bodyParser.json());

app.post('/', async (req:Request, res:Response) => {

    try {
        fetchIPDetails().then(async (data): Promise<void> => {
    
            let record = new RecordModel(
                randomUUID().toString().substring(0, 15),
                data.ip,
                data.city,
                data.region,
                data.country,
                data.postal,
                data.latitude,
                data.longitude,
                data.timezone,
                data.org,
                req.body.os,
                req.body.browser,
                req.body.device,
                Date.now() as unknown as string,
                Date.now() as unknown as string
            );
            //save the record to the database
           const res = await fetch(`${DBURL}collections/IP_Details/records`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    "Authorization": `Bearer ${POCKETBASE_TOKEN}`,
                },
                body: JSON.stringify(record),}).then((response) => {
                console.log(response);
            }).catch((error) => {
                console.error(error);
            });
        }); 
        res.status(200).send("Record saved successfully");
    } catch (error) {
        console.error(error);
        res.status(500).send("Error saving record");
    }
});


async function fetchIPDetails(){
    try{
        const res = await fetch('https://api.ipify.org?format=json', { cache: "no-store" });
        const data = await res.json();
        const response = await axios.get(`https://ipapi.co/${data.ip}/json/`);
        console.log(response.data);
        return response.data;
    }catch(error){
        console.error(error);
        return null;
    }
}
app.get("/records", async (req:Request,res:Response)=>{

    console.log("Getting records");
    //get all the records from the database
    const response = await fetch(`${DBURL}collections/IP_Details/records`,
    {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${POCKETBASE_TOKEN}`,
        }, 
      });

    const data = await response.json();
    console.log(data);
    res.send(data);
});

app.get("/stats",(req:Request,res:Response)=>{

    console.log("Getting stats");
    //get all the records from the database
    const response = fetch(`${DBURL}collections/IP_Details/records`,
    {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${POCKETBASE_TOKEN}`,
        }, 
      }).then(async (response) => {
        const data = await response.json();
        const countryStats = data.reduce((acc: any, item: any) => {
            acc[item.country] = acc[item.country] ? acc[item.country] + item.visit_count : 1;
            return acc;
          }, {});
        
          const orgStats = data.reduce((acc: any, item: any) => {
            acc[item.org] = acc[item.org] ? acc[item.org] + 1 : 1;
            return acc;
          }, {});

          const browserStats = data.reduce((acc: any, item: any) => {
            acc[item.browser] = acc[item.browser] ? acc[item.browser] + 1 : 1;
            return acc;
          }, {});

            const osStats = data.reduce((acc: any, item: any) => {
                acc[item.os] = acc[item.os] ? acc[item.os] + 1 : 1;
                return acc;
            }, {});

          const deviceStats = data.reduce((acc: any, item: any) => {
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

        res.send({countryStats,orgStats,browserStats,osStats,deviceStats,overallStats});
        
          res.send({countryStats,orgStats});
    }).catch((error) => {
        console.error(error);
    });
});

//create a https server by using the cert and key

server.listen(port, () => {
    console.log(`Server is running on https://localhost:${port}`);
});
