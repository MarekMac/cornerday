-- The client-side check in saveQuickPay (tracker/index.tsx) validates a
-- payment against `paidByDebt`, which is derived from the last fetchAll()
-- and can be stale. Two payments submitted close together (two devices, or
-- one landing between screen focus and a stale re-render) can each pass the
-- client check and jointly overpay a debt — there was no DB-level guard.
--
-- SELECT ... FOR UPDATE on the debts row serializes concurrent payments to
-- the same debt: the second insert's trigger blocks until the first commits,
-- then re-reads the now-current payment total under READ COMMITTED
-- isolation, so it correctly sees the first payment before deciding whether
-- it would overpay.
CREATE OR REPLACE FUNCTION public.check_debt_payment_total()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_amount numeric;
  v_paid_amount numeric;
BEGIN
  SELECT total_amount INTO v_total_amount FROM debts WHERE id = NEW.debt_id FOR UPDATE;
  IF v_total_amount IS NULL THEN
    RAISE EXCEPTION 'Debt % not found', NEW.debt_id;
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid_amount FROM debt_payments WHERE debt_id = NEW.debt_id;
  -- Small epsilon to tolerate float/decimal rounding on the client (amounts
  -- are entered as e.g. "50.005" rounded to cents before this check runs).
  IF v_paid_amount + NEW.amount > v_total_amount + 0.01 THEN
    RAISE EXCEPTION 'Payment of % would exceed remaining debt (already paid %, total %)',
      NEW.amount, v_paid_amount, v_total_amount;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_debt_payment_total ON debt_payments;
CREATE TRIGGER trg_check_debt_payment_total
  BEFORE INSERT ON debt_payments
  FOR EACH ROW EXECUTE FUNCTION public.check_debt_payment_total();
