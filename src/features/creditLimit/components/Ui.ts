/**
 * The app's form vocabulary, as Credit Limit uses it.
 *
 * RE-EXPORTED, NOT COPIED. `Card`, `Field`, `Input`, `Row`, `Select`,
 * `DateField` and the notices are generic — a titled card, a labelled field, a
 * two-column row — and they already carry this app's metrics: the 56pt control
 * height, the 12pt/500 caption with 8 beneath it, the outlined input. They
 * live under `advancePayments` because that is the module that first needed
 * them, and a second copy here would be two definitions of one look, drifting
 * apart the first time either is adjusted.
 *
 * If a third module needs them, this is the point at which they should move to
 * `src/components/common/` and both features import from there.
 */
export {
  Card,
  DateField,
  Field,
  Input,
  Notice,
  NoticeText,
  Row,
  Section,
  Select,
  type Tone,
} from "@/src/features/advancePayments/components/AdvanceUi";
