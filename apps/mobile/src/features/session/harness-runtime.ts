import type { HarnessEvent } from '@contracts/harness';

// Session, generation, and response identities gate every UI and playback transition.
export class HarnessCursor {
  private session: string | null = null;
  private sequence = 0;
  private turn = 0;
  private epoch = 0;
  private active: number | null = null;
  private response: string | null = null;

  begin() {
    this.turn += 1;
    this.epoch += 1;
    this.active = this.turn;
    this.response = null;
    return this.turn;
  }

  cancel(unstarted = false) {
    if (unstarted && this.active === this.turn) {
      this.turn -= 1;
      this.epoch -= 1;
    }
    this.active = null;
    this.response = null;
  }

  current() {
    return this.active;
  }

  generation() {
    return this.epoch;
  }

  reply() {
    return this.response;
  }

  accept(event: HarnessEvent) {
    if (this.session === null) {
      if (event.type !== 'session.ready' || event.generation !== 0) return false;
      this.session = event.sessionId;
    } else if (event.type === 'session.ready') {
      return false;
    }
    if (event.sessionId !== this.session || event.sequence <= this.sequence) return false;
    this.sequence = event.sequence;
    if ('turnId' in event) {
      if (event.turnId !== this.active || event.generation !== this.epoch) return false;
      if (event.type === 'turn.response') {
        if (this.response !== null) return false;
        this.response = event.responseId;
      } else if ('responseId' in event && event.responseId !== this.response) {
        return false;
      }
    }
    return true;
  }
}
