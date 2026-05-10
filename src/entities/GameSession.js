export class GameSession {
  constructor(data = {}) {
    this.id = data.id || null;
    this.table_code = data.table_code || '';
    this.hostName = data.hostName || '';
    this.phase = data.phase || 'lobby'; // lobby | game | vote | results
    this.players = data.players || [];
    this.currentLiar = data.currentLiar || null;
    this.activeStory = data.activeStory || null;
    this.votes = data.votes || {};
    this.timer_end = data.timer_end || null;
    this.timer_duration = data.timer_duration || 0;
  }

  static fromJson(json) {
    return new GameSession(json);
  }

  toJson() {
    return {
      id: this.id,
      table_code: this.table_code,
      hostName: this.hostName,
      phase: this.phase,
      players: this.players,
      currentLiar: this.currentLiar,
      activeStory: this.activeStory,
      votes: this.votes,
      timer_end: this.timer_end,
      timer_duration: this.timer_duration
    };
  }
}
