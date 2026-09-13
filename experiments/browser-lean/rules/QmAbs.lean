/-
Experimental narrow rules, not imported by the production generator.
Adapted from Mathlib.Analysis.Calculus.Deriv.Abs, copyright (c) 2024
Etienne Marion, Apache 2.0. The local-neighborhood proof does not need
the inner-product-space calculus imported by that broader module.
-/
module
public import Mathlib.Analysis.Calculus.Deriv.Add

namespace QuickMaths.Formal.Experimental
open Real Set

public theorem abs_pos {x : ℝ} (hx : 0 < x) : HasDerivAt (|·|) 1 x :=
  ((hasStrictDerivAt_id x).congr_of_eventuallyEq <|
    EqOn.eventuallyEq_of_mem (fun _ hy ↦ (abs_of_pos (mem_Ioi.1 hy)).symm)
      (Ioi_mem_nhds hx)).hasDerivAt

public theorem abs_neg {x : ℝ} (hx : x < 0) : HasDerivAt (|·|) (-1) x :=
  ((hasStrictDerivAt_neg x).congr_of_eventuallyEq <|
    EqOn.eventuallyEq_of_mem (fun _ hy ↦ (abs_of_neg (mem_Iio.1 hy)).symm)
      (Iio_mem_nhds hx)).hasDerivAt

end QuickMaths.Formal.Experimental
#print axioms QuickMaths.Formal.Experimental.abs_pos
#print axioms QuickMaths.Formal.Experimental.abs_neg
