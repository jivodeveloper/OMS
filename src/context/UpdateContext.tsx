import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  setUpdateRequiredHandler,
  type UpdateRequiredPayload,
} from '../services/api';
import { deviceService } from '../services/device.service';

/**
 * UpdateContext — the single global "the app must update" flag.
 *
 * The API layer (src/services/api.ts) raises this from ONE chokepoint when the
 * backend answers HTTP 426 with code APP_UPDATE_REQUIRED. No screen touches 426
 * itself. While `updateRequired` is true the root layout swaps the whole app for
 * the UpdateRequiredScreen, so navigation is blocked without changing any
 * business screen.
 *
 * Deliberately does NOT touch auth, tokens, AsyncStorage, drafts or cache — a
 * force update only blocks usage; it never logs the user out.
 */
export type UpdateState = {
  updateRequired: boolean;
  message: string;
  requiredVersion: string | null;
  requiredBuild: number | null;
  storeUrl: string | null;
};

const DEFAULT_STATE: UpdateState = {
  updateRequired: false,
  message: '',
  requiredVersion: null,
  requiredBuild: null,
  storeUrl: null,
};

const UpdateContext = createContext<UpdateState | undefined>(undefined);

export const UpdateProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<UpdateState>(DEFAULT_STATE);

  useEffect(() => {
    // Register the API-layer handler. Once raised, the block stays up for the
    // rest of this app run: the ONLY correct way out is installing the new
    // build, which is a fresh process that starts clean (updateRequired=false)
    // and — being on the required build — no longer receives 426. So there is
    // no manual reset and nothing to clear here.
    setUpdateRequiredHandler((payload: UpdateRequiredPayload) => {
      // Ignore a 426 this build already satisfies.
      //
      // The server answers 426 when it thinks we are below `required_build`.
      // If our OWN build is at or above the value it just named, the response
      // contradicts itself -- we cannot install anything newer than what is
      // already running. That never means "out of date"; it means the request
      // did not carry correct version headers (they are attached by a provider
      // that can, in principle, be missing) or it reached a different backend.
      //
      // This matters because the block below is a deliberate ONE-WAY latch:
      // without this check a single such response strands a fully up-to-date
      // app on the update screen until the process is killed, and no amount of
      // updating clears it because there is nothing newer to install.
      const requiredBuild = Number(payload.required_build);
      const ourBuild = Number(deviceService.getBuildNumber());
      if (
        Number.isFinite(requiredBuild) &&
        Number.isFinite(ourBuild) &&
        ourBuild >= requiredBuild
      ) {
        console.log(
          'UpdateContext: ignoring APP_UPDATE_REQUIRED for build ' +
            requiredBuild +
            ' — this app is build ' +
            ourBuild +
            '. Version headers or backend target are wrong, not the app.',
        );
        return;
      }

      setState((current) => {
        if (current.updateRequired) return current; // already blocked; keep first
        return {
          updateRequired: true,
          message: payload.message || 'Please update the application to continue.',
          requiredVersion: payload.required_version ?? null,
          requiredBuild: payload.required_build ?? null,
          storeUrl: payload.store_url ?? null,
        };
      });
    });
    return () => setUpdateRequiredHandler(null);
  }, []);

  const value = useMemo(() => state, [state]);

  return (
    <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>
  );
};

export const useUpdate = (): UpdateState => {
  const context = useContext(UpdateContext);
  if (!context) {
    throw new Error('useUpdate must be used within an UpdateProvider');
  }
  return context;
};
