export class Webhook {
  constructor(data = {}) {
    this.event = data.event || '';
    this.payload = data.payload || {};
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  static fromJson(json) {
    return new Webhook(json);
  }

  toJson() {
    return {
      event: this.event,
      payload: this.payload,
      timestamp: this.timestamp
    };
  }
}
