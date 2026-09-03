import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MaterialUsageFields, {
  MaterialUsageSummary,
  type MaterialOption,
} from "../MaterialUsageFields";

/** Filler rows, prefixed so they never collide with the named chemicals. */
const catalog = (n: number): MaterialOption[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `filler${i}`,
    name: `Material ${i}`,
    unit: "gallon",
  }));

const CHEMICALS: MaterialOption[] = [
  { id: "m1", name: "Chlorine", unit: "gallon" },
  { id: "m2", name: "Muriatic acid", unit: "gallon" },
  { id: "m3", name: "Filter cartridge", unit: "unit" },
];

const qtyFor = (name: RegExp | string) => screen.getByLabelText(name);

describe("MaterialUsageFields", () => {
  it("gives every material a quantity box named for the server", () => {
    render(<MaterialUsageFields materials={CHEMICALS} />);
    // parseMaterialUsage reads `qty_<materialId>`.
    expect(qtyFor(/chlorine/i)).toHaveAttribute("name", "qty_m1");
    expect(qtyFor(/muriatic acid/i)).toHaveAttribute("name", "qty_m2");
    expect(qtyFor(/filter cartridge/i)).toHaveAttribute("name", "qty_m3");
  });

  it("shows each material's unit so the number means something", () => {
    render(<MaterialUsageFields materials={CHEMICALS} />);
    expect(screen.getAllByText("gallon")).toHaveLength(2);
    expect(screen.getByText("unit")).toBeInTheDocument();
  });

  it("asks phones for a decimal keypad", () => {
    render(<MaterialUsageFields materials={CHEMICALS} />);
    const input = qtyFor(/chlorine/i);
    expect(input).toHaveAttribute("inputMode", "decimal");
    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveAttribute("step", "0.01");
    expect(input).toHaveAttribute("min", "0");
  });

  it("starts empty so a blank box is never submitted as a zero", () => {
    render(<MaterialUsageFields materials={CHEMICALS} />);
    expect(qtyFor(/chlorine/i)).toHaveValue(null);
  });

  it("records what the user types", async () => {
    render(<MaterialUsageFields materials={CHEMICALS} />);
    await userEvent.type(qtyFor(/chlorine/i), "2.5");
    expect(qtyFor(/chlorine/i)).toHaveValue(2.5);
  });

  it("counts what has been added", async () => {
    render(<MaterialUsageFields materials={CHEMICALS} />);
    expect(screen.queryByText(/added/)).not.toBeInTheDocument();

    await userEvent.type(qtyFor(/chlorine/i), "2");
    expect(screen.getByText("1 added")).toBeInTheDocument();

    await userEvent.type(qtyFor(/filter cartridge/i), "1");
    expect(screen.getByText("2 added")).toBeInTheDocument();
  });

  it("does not count a zero as added", async () => {
    render(<MaterialUsageFields materials={CHEMICALS} />);
    await userEvent.type(qtyFor(/chlorine/i), "0");
    expect(screen.queryByText(/added/)).not.toBeInTheDocument();
  });

  it("says so when the catalog is empty", () => {
    render(<MaterialUsageFields materials={[]} />);
    expect(screen.getByText(/no materials in the catalog/i)).toBeInTheDocument();
  });

  it("takes a custom label and hint", () => {
    render(
      <MaterialUsageFields
        materials={CHEMICALS}
        label="Materials used (optional)"
        hint="Comes off stock."
      />
    );
    expect(screen.getByText("Materials used (optional)")).toBeInTheDocument();
    expect(screen.getByText("Comes off stock.")).toBeInTheDocument();
  });

  describe("filtering a long catalog", () => {
    it("stays out of the way for a short catalog", () => {
      render(<MaterialUsageFields materials={CHEMICALS} />);
      expect(screen.queryByLabelText(/filter materials/i)).not.toBeInTheDocument();
    });

    it("appears once the catalog is long enough to scroll past", () => {
      render(<MaterialUsageFields materials={catalog(12)} />);
      expect(screen.getByLabelText(/filter materials/i)).toBeInTheDocument();
    });

    it("narrows the list to the match", async () => {
      const materials = [...CHEMICALS, ...catalog(6)];
      render(<MaterialUsageFields materials={materials} />);
      await userEvent.type(screen.getByLabelText(/filter materials/i), "chlor");

      expect(qtyFor(/chlorine/i).closest("li")).toBeVisible();
      expect(qtyFor(/muriatic acid/i).closest("li")).not.toBeVisible();
    });

    it("matches regardless of case", async () => {
      const materials = [...CHEMICALS, ...catalog(6)];
      render(<MaterialUsageFields materials={materials} />);
      await userEvent.type(screen.getByLabelText(/filter materials/i), "CHLOR");
      expect(qtyFor(/chlorine/i).closest("li")).toBeVisible();
    });

    it("keeps a filtered-out row's value in the form", async () => {
      // The row is hidden, not unmounted — otherwise the quantity would vanish
      // from the submission without the user ever seeing it go.
      const materials = [...CHEMICALS, ...catalog(6)];
      render(<MaterialUsageFields materials={materials} />);

      await userEvent.type(qtyFor(/muriatic acid/i), "3");
      await userEvent.type(screen.getByLabelText(/filter materials/i), "chlorine");

      const input = qtyFor(/muriatic acid/i);
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue(3);
    });

    it("keeps a row the user filled in on screen", async () => {
      // Hiding something already entered would look like losing it.
      const materials = [...CHEMICALS, ...catalog(6)];
      render(<MaterialUsageFields materials={materials} />);

      await userEvent.type(qtyFor(/muriatic acid/i), "3");
      await userEvent.type(screen.getByLabelText(/filter materials/i), "chlorine");

      expect(qtyFor(/muriatic acid/i).closest("li")).toBeVisible();
    });

    it("says when nothing matches", async () => {
      render(<MaterialUsageFields materials={catalog(12)} />);
      await userEvent.type(screen.getByLabelText(/filter materials/i), "zzzz");
      expect(screen.getByText(/nothing matches/i)).toBeInTheDocument();
    });

    it("restores the full list when the filter is cleared", async () => {
      const materials = [...CHEMICALS, ...catalog(6)];
      render(<MaterialUsageFields materials={materials} />);
      const filter = screen.getByLabelText(/filter materials/i);

      await userEvent.type(filter, "chlorine");
      expect(qtyFor(/muriatic acid/i).closest("li")).not.toBeVisible();

      await userEvent.clear(filter);
      expect(qtyFor(/muriatic acid/i).closest("li")).toBeVisible();
    });
  });
});

describe("MaterialUsageSummary", () => {
  const used = [
    { name: "Chlorine", unit: "gallon", quantityUsed: 2.5 },
    { name: "Filter cartridge", unit: "unit", quantityUsed: 1 },
  ];

  it("lists what the job consumed, with units", () => {
    render(<MaterialUsageSummary materials={used} />);
    const chlorine = screen.getByText("Chlorine").closest("li")!;
    expect(within(chlorine).getByText("2.5 gallon")).toBeInTheDocument();
  });

  it("offers no inputs — this usage is already committed to stock", () => {
    render(<MaterialUsageSummary materials={used} />);
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("explains where the numbers came from", () => {
    render(
      <MaterialUsageSummary materials={used} hint="Logged by the crew and already taken out of stock." />
    );
    expect(screen.getByText(/logged by the crew/i)).toBeInTheDocument();
  });
});
