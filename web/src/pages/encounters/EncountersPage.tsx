import { useEffect, useState } from 'react';
import { api, subscribe } from '../../api';
import type { ConfigState, EncounterAction, EncounterOutcome, EncounterState } from '../../types';
import { Prepare } from './Prepare';
import { LiveEncounter } from './LiveEncounter';

/** Run a fight: set one up (quick, from the wiki, or blank), then the live encounter page. Live on every open view. */
export function EncountersPage() {
  const [state, setState] = useState<EncounterState | null | undefined>(undefined);
  const [outcome, setOutcome] = useState<EncounterOutcome | null>(null);
  const [error, setError] = useState('');
  const [assistant, setAssistant] = useState(false);

  useEffect(() => {
    api<ConfigState>('/config').then((c) => setAssistant(!!c.config?.encounters.assistant), () => {});
    api<EncounterState | null>('/encounter').then(setState, (e: Error) => setError(e.message));
    return subscribe({ onEncounter: setState, onReconnect: () => void api<EncounterState | null>('/encounter').then(setState, () => {}) });
  }, []);

  /** Sends one change; the answer (and the live event) carry the new state. */
  const act = async (action: EncounterAction) => {
    setError('');
    try {
      setState(await api<EncounterState>('/encounter/actions', { method: 'POST', json: action }));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const end = async () => {
    setError('');
    try {
      setOutcome(await api<EncounterOutcome>('/encounter/end', { method: 'POST', json: {} }));
      setState(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (state === undefined) return error ? <div className="error-box">{error}</div> : <p className="muted">Loading…</p>;
  return (
    <div className={state ? 'live-page' : 'encounters'}>
      {error && (
        <div className="error-box live-error" role="alert">
          {error}
        </div>
      )}
      {state ? (
        <LiveEncounter state={state} act={act} onEnd={end} assistant={assistant} />
      ) : (
        <Prepare
          outcome={outcome}
          onStarted={(s) => {
            setOutcome(null);
            setState(s);
          }}
        />
      )}
    </div>
  );
}
