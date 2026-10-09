import { appAlert } from "@/src/components/common/AppDialog";

import { failureDetails, failureMessage, failureText } from "./logic/failure";

/**
 * Every refusal this module shows, in the server's own words.
 *
 * THE WORDS THEMSELVES COME FROM `logic/failure.ts`, which is pure and
 * tested (`failure.test.ts`): the headline, and every line of detail the
 * server put in `errors` — including the nested shapes DRF produces for a
 * list serializer, which is where an expense line's refusal lives.
 *
 * This file is only the dialog. The caller passes the TITLE, because what
 * failed is the one thing the server cannot know: "Could not send", "Could not
 * save the payment details".
 */

export { failureDetails, failureMessage, failureText };

/**
 * Show a refusal: the title, the server's message, and every line of detail.
 *
 * A plain `Error` thrown by this feature's own logic (`formFromAssignment`
 * says a bill is no longer open) carries its sentence in `message` and no
 * envelope, and comes out of here unchanged.
 */
export function showFailure(title: string, err: unknown): void {
  appAlert(title, failureText(err));
}
