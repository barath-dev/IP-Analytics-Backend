"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecordModel = void 0;
class RecordModel {
    constructor(id, ip, city, region, country, postal, latitude, longitude, timezone, org, os, browser, device, created_at, updated_at) {
        this.id = id;
        this.ip = ip;
        this.city = city;
        this.region = region;
        this.country = country;
        this.postal = postal;
        this.latitude = latitude;
        this.longitude = longitude;
        this.timezone = timezone;
        this.org = org;
        this.os = os;
        this.browser = browser;
        this.device = device;
        this.created_at = created_at;
        this.updated_at = updated_at;
        this.id = id;
        this.ip = ip;
        this.city = city;
        this.region = region;
        this.country = country;
        this.postal = postal;
        this.latitude = latitude;
        this.longitude = longitude;
        this.timezone = timezone;
        this.org = org;
        this.os = os;
        this.browser = browser;
        this.device = device;
        this.created_at = created_at;
        this.updated_at = updated_at;
    }
    static fromJson(json) {
        return new RecordModel(json.id, json.ip, json.city, json.region, json.country, json.postal, json.latitude, json.longitude, json.timezone, json.org, json.os, json.browser, json.device, json.created_at, json.updated_at);
    }
    toJson() {
        return {
            id: this.id,
            ip: this.ip,
            city: this.city,
            region: this.region,
            country: this.country,
            postal: this.postal,
            latitude: this.latitude,
            longitude: this.longitude,
            timezone: this.timezone,
            org: this.org,
            os: this.os,
            browser: this.browser,
            device: this.device,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }
    static fromJsonArray(json) {
        return json.map(RecordModel.fromJson);
    }
    static toJsonArray(models) {
        return models.map(model => model.toJson());
    }
}
exports.RecordModel = RecordModel;
