export class RecordModel {
    constructor(
        public id?: string,
        public site_id?: string,
        public ip?: string,
        public city?: string,
        public region?: string,
        public country?: string,
        public postal?: string,
        public latitude?: number,
        public longitude?: number,
        public timezone?: string,
        public org?: string,
        public os?: string,
        public browser?: string,
        public device?: string,
        public referrer?: string,
        public pathname?: string,
        public visit_count?: number,
        public created_at?: string,
        public updated_at?: string
    ) {
        this.id = id;
        this.site_id = site_id;
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
        this.referrer = referrer;
        this.pathname = pathname;
        this.visit_count = visit_count;
        this.created_at = created_at;
        this.updated_at = updated_at;
    }

    static fromJson(json: any): RecordModel {
        return new RecordModel(
            json.id,
            json.site_id,
            json.ip,
            json.city,
            json.region,
            json.country,
            json.postal,
            json.latitude,
            json.longitude,
            json.timezone,
            json.org,
            json.os,
            json.browser,
            json.device,
            json.referrer,
            json.pathname,
            json.visit_count,
            json.created_at,
            json.updated_at
        );
    }

    toJson(): any {
        return {
            id: this.id,
            site_id: this.site_id,
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
            referrer: this.referrer,
            pathname: this.pathname,
            visit_count: this.visit_count,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }

    static fromJsonArray(json: any[]): RecordModel[] {
        return json.map(RecordModel.fromJson);
    }

    static toJsonArray(models: RecordModel[]): any[] {
        return models.map(model => model.toJson());
    }

}