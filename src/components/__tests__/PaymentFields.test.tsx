import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PaymentFields from "../PaymentFields";

// The real autocomplete calls a geocoding API as you type; the payment form's
// behaviour doesn't depend on that, so stand in a plain input carrying the
// same field name.
jest.mock("../AddressAutocomplete", () => ({
  __esModule: true,
  default: ({ id, name, required }: { id?: string; name: string; required?: boolean }) => (
    <input id={id} name={name} required={required} aria-label="Billing address" />
  ),
}));

const amount = () => screen.getByLabelText(/amount paid/i) as HTMLInputElement;
const methodSelect = () => screen.getByLabelText(/method/i);

describe("PaymentFields", () => {
  it("defaults the amount to the full balance", () => {
    render(<PaymentFields balance={149.5} />);
    expect(amount()).toHaveValue(149.5);
  });

  it("caps the amount at the balance and requires at least a cent", () => {
    render(<PaymentFields balance={149.5} />);
    expect(amount()).toHaveAttribute("max", "149.5");
    expect(amount()).toHaveAttribute("min", "0.01");
  });

  it("tells the user a smaller amount is a partial payment", () => {
    render(<PaymentFields balance={149.5} />);
    expect(screen.getByText(/balance due 149\.50/i)).toBeInTheDocument();
    expect(screen.getByText(/partial payment/i)).toBeInTheDocument();
  });

  it("starts on cash with no extra fields", () => {
    render(<PaymentFields balance={100} />);
    expect(methodSelect()).toHaveValue("CASH");
    expect(screen.queryByLabelText(/check number/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/billing address/i)).not.toBeInTheDocument();
  });

  it("asks for a check number when the method is check", async () => {
    render(<PaymentFields balance={100} />);
    await userEvent.selectOptions(methodSelect(), "CHECK");

    const check = screen.getByLabelText(/check number/i);
    expect(check).toBeRequired();
    expect(check).toHaveAttribute("name", "checkNumber");
    expect(screen.queryByLabelText(/billing address/i)).not.toBeInTheDocument();
  });

  it("asks for a billing address when the method is online", async () => {
    render(<PaymentFields balance={100} />);
    await userEvent.selectOptions(methodSelect(), "ONLINE");

    const address = screen.getByLabelText(/billing address/i);
    expect(address).toBeRequired();
    expect(address).toHaveAttribute("name", "billingAddress");
    expect(screen.queryByLabelText(/check number/i)).not.toBeInTheDocument();
  });

  it("drops the check number when switching away from check", async () => {
    // Otherwise a stale check number would be submitted with a cash payment.
    render(<PaymentFields balance={100} />);
    await userEvent.selectOptions(methodSelect(), "CHECK");
    await userEvent.type(screen.getByLabelText(/check number/i), "1042");
    await userEvent.selectOptions(methodSelect(), "CASH");

    expect(screen.queryByLabelText(/check number/i)).not.toBeInTheDocument();
  });

  it("keeps an edited amount when the method changes", async () => {
    render(<PaymentFields balance={100} />);
    await userEvent.clear(amount());
    await userEvent.type(amount(), "40");
    await userEvent.selectOptions(methodSelect(), "CHECK");

    expect(amount()).toHaveValue(40);
  });

  it("names the fields the payment action reads", () => {
    render(<PaymentFields balance={100} />);
    expect(amount()).toHaveAttribute("name", "amount");
    expect(methodSelect()).toHaveAttribute("name", "method");
    expect(screen.getByLabelText(/note/i)).toHaveAttribute("name", "note");
  });

  it("leaves the note optional", () => {
    render(<PaymentFields balance={100} />);
    expect(screen.getByLabelText(/note/i)).not.toBeRequired();
  });
});
