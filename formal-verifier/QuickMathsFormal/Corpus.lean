import Mathlib

open Filter Topology Set

namespace QuickMathsFormal

/-- Guarded rational cancellation: the cancelled factor must be nonzero. -/
theorem guarded_rational_cancellation (x : ℝ) (hden : x - 3 ≠ 0) :
    (x ^ 2 - 9) / (x - 3) = x + 3 := by
  field_simp [hden] <;> ring

/-- Difference quotients retain the `h ≠ 0` side condition. -/
theorem square_difference_quotient (x h : ℝ) (hh : h ≠ 0) :
    ((x + h) ^ 2 - x ^ 2) / h = 2 * x + h := by
  field_simp [hh] <;> ring

/-- `sqrt(x²) = x` only under the nonnegative hypothesis. -/
theorem sqrt_square_of_nonnegative (x : ℝ) (hx : 0 ≤ x) :
    Real.sqrt (x ^ 2) = x := by
  rw [Real.sqrt_sq_eq_abs, abs_of_nonneg hx]

/-- Multiplying conjugates uses the square-root domain hypothesis. -/
theorem conjugate_identity (x : ℝ) (hx : 0 ≤ x) :
    (Real.sqrt x - 2) * (Real.sqrt x + 2) = x - 4 := by
  nlinarith [Real.sq_sqrt hx]

/-- A narrow IVT acceptance case: x^2 crosses 2 on [0, 2]. -/
theorem ivt_square_root_two_exists :
    ∃ c : ℝ, 0 ≤ c ∧ c ≤ 2 ∧ c ^ 2 = 2 := by
  have hcont : ContinuousOn (fun c : ℝ => c ^ 2) (Set.Icc 0 2) := by fun_prop
  have htarget : (2 : ℝ) ∈ Set.Icc ((fun c : ℝ => c ^ 2) 0) ((fun c : ℝ => c ^ 2) 2) := by
    norm_num
  obtain ⟨c, hmem, hvalue⟩ := intermediate_value_Icc (by norm_num : (0 : ℝ) ≤ 2) hcont htarget
  exact ⟨c, hmem.1, hmem.2, by simpa using hvalue⟩

/-- Polynomial derivatives are reconstructed compositionally from mathlib derivative lemmas. -/
theorem polynomial_derivative_at (a : ℝ) :
    HasDerivAt (fun x : ℝ => x ^ 2 + 3 * x) (2 * a + 3) a := by
  convert
    ((hasDerivAt_id' a).fun_pow 2).fun_add
      ((hasDerivAt_const a (3 : ℝ)).fun_mul (hasDerivAt_id' a)) using 1 <;>
    all_goals first | (norm_num <;> ring) | (ext x <;> ring)

/-- Quotient derivatives require the denominator to be nonzero at the evaluation point. -/
theorem quotient_derivative_at (a : ℝ) (hden : a - 1 ≠ 0) :
    HasDerivAt (fun x : ℝ => (x ^ 2 + 1) / (x - 1))
      (((2 * a) * (a - 1) - (a ^ 2 + 1)) / (a - 1) ^ 2) a := by
  convert
    (((hasDerivAt_id' a).fun_pow 2).fun_add (hasDerivAt_const a (1 : ℝ))).fun_div
      ((hasDerivAt_id' a).fun_sub (hasDerivAt_const a (1 : ℝ))) hden using 1 <;>
    all_goals first | (field_simp [hden] <;> ring) | (ext x <;> field_simp [hden] <;> ring)

/-- School-real square-root differentiation is exposed only at strictly positive radicands. -/
theorem sqrt_derivative_at (a : ℝ) (hpos : 0 < a) :
    HasDerivAt (fun x : ℝ => Real.sqrt x) (1 / (2 * Real.sqrt a)) a := by
  exact Real.hasDerivAt_sqrt (ne_of_gt hpos)

/-- Absolute-value differentiation selects the positive branch from an explicit sign. -/
theorem abs_polynomial_derivative_positive (a : ℝ) (hpos : 0 < a - 1) :
    HasDerivAt (fun x : ℝ => |x - 1|) 1 a := by
  simpa [Function.comp_def] using
    (hasDerivAt_abs_pos hpos).comp a
      ((hasDerivAt_id' a).fun_sub (hasDerivAt_const a (1 : ℝ)))

/-- The negative absolute-value branch reverses the inner derivative. -/
theorem abs_polynomial_derivative_negative (a : ℝ) (hneg : a - 1 < 0) :
    HasDerivAt (fun x : ℝ => |x - 1|) (-1) a := by
  simpa [Function.comp_def] using
    (hasDerivAt_abs_neg hneg).comp a
      ((hasDerivAt_id' a).fun_sub (hasDerivAt_const a (1 : ℝ)))

/-- Elementary exponentials compose with the polynomial derivative. -/
theorem exp_polynomial_derivative (a : ℝ) :
    HasDerivAt (fun x : ℝ => Real.exp (x ^ 2)) (Real.exp (a ^ 2) * (2 * a)) a := by
  convert (((hasDerivAt_id' a).fun_pow 2).exp) using 1 <;>
    all_goals first | (norm_num <;> ring) | (ext x <;> ring)

/-- QuickMaths requires the school-real positive logarithm domain, then derives mathlib's nonzero guard. -/
theorem log_polynomial_derivative (a : ℝ) (hpos : 0 < a + 1) :
    HasDerivAt (fun x : ℝ => Real.log (x + 1)) (1 / (a + 1)) a := by
  have hne : a + 1 ≠ 0 := ne_of_gt hpos
  convert
    ((hasDerivAt_id' a).fun_add (hasDerivAt_const a (1 : ℝ))).log hne using 1 <;>
    all_goals first | (field_simp [hne] <;> ring) | (ext x <;> field_simp [hne] <;> ring)

/-- Sine chain rule over a polynomial inner expression. -/
theorem sin_polynomial_derivative (a : ℝ) :
    HasDerivAt (fun x : ℝ => Real.sin (2 * x)) (2 * Real.cos (2 * a)) a := by
  convert
    ((hasDerivAt_const a (2 : ℝ)).fun_mul (hasDerivAt_id' a)).sin using 1 <;>
    all_goals first | (norm_num <;> ring) | (ext x <;> ring)

/-- Cosine chain rule over a polynomial inner expression. -/
theorem cos_polynomial_derivative (a : ℝ) :
    HasDerivAt (fun x : ℝ => Real.cos (x ^ 2)) ((-(2 * a)) * Real.sin (a ^ 2)) a := by
  convert (((hasDerivAt_id' a).fun_pow 2).cos) using 1 <;>
    all_goals first | (norm_num <;> ring) | (ext x <;> ring)

/-- `1/x` tends to positive infinity from the right of zero. -/
theorem inverse_right_infinity :
    Tendsto (fun x : ℝ => 1 / x) (𝓝[>] 0) atTop := by
  simpa [one_div] using
    (tendsto_inv_nhdsGT_zero : Tendsto (fun x : ℝ => x⁻¹) (𝓝[>] (0 : ℝ)) atTop)

/-- `1/x` tends to negative infinity from the left of zero. -/
theorem inverse_left_infinity :
    Tendsto (fun x : ℝ => 1 / x) (𝓝[<] 0) atBot := by
  simpa [one_div] using
    (tendsto_inv_nhdsLT_zero : Tendsto (fun x : ℝ => x⁻¹) (𝓝[<] (0 : ℝ)) atBot)

/-- The first calculus acceptance case preserves the punctured domain. -/
theorem removable_hole_limit :
    Tendsto (fun x : ℝ => (x ^ 2 - 9) / (x - 3)) (𝓝[≠] 3) (𝓝 6) := by
  have hs : Tendsto (fun x : ℝ => x + 3) (𝓝[≠] 3) (𝓝 6) := by
    have hc : ContinuousAt (fun x : ℝ => x + 3) 3 := by fun_prop
    exact tendsto_nhdsWithin_of_tendsto_nhds (by simpa [show (3 : ℝ) + 3 = 6 by norm_num] using hc.tendsto)
  refine hs.congr' ?_
  filter_upwards [self_mem_nhdsWithin] with x hx
  simp only [Set.mem_compl_iff, Set.mem_singleton_iff] at hx
  have hden : x - 3 ≠ 0 := sub_ne_zero.mpr hx
  field_simp [hden] <;> ring


/-- Absolute value is continuous at its kink even though it is not differentiable there. -/
theorem abs_limit_zero_by_continuity :
    Tendsto (fun x : ℝ => |x|) (𝓝[≠] 0) (𝓝 0) := by
  have hcont : ContinuousAt (fun x : ℝ => |x|) 0 := by fun_prop
  convert tendsto_nhdsWithin_of_tendsto_nhds hcont.tendsto using 1 <;>
    simp <;> norm_num <;> ring

/-- Nested school-real logarithm/exponential continuity carries an explicit positive guard. -/
theorem log_exp_limit_two :
    Tendsto (fun x : ℝ => Real.log (Real.exp x)) (𝓝[≠] 2) (𝓝 2) := by
  have hpos : 0 < (Real.exp (2 : ℝ)) := by positivity
  have hne : Real.exp (2 : ℝ) ≠ 0 := ne_of_gt hpos
  have hcont : ContinuousAt (fun x : ℝ => Real.log (Real.exp x)) 2 := by fun_prop
  convert tendsto_nhdsWithin_of_tendsto_nhds hcont.tendsto using 1 <;>
    simp <;> norm_num <;> ring

/-- A structurally nonzero denominator enables direct-substitution continuity. -/
theorem guarded_quotient_limit_zero :
    Tendsto (fun x : ℝ => 1 / (x ^ 2 + 1)) (𝓝[≠] 0) (𝓝 1) := by
  have hden : ((0 : ℝ) ^ 2 + 1) ≠ 0 := by norm_num
  have hcont : ContinuousAt (fun x : ℝ => 1 / (x ^ 2 + 1)) 0 := by fun_prop
  convert tendsto_nhdsWithin_of_tendsto_nhds hcont.tendsto using 1 <;>
    simp <;> norm_num <;> ring


/-- A one-sided square-root limit keeps the school-real domain in the source filter. -/
theorem sqrt_right_limit_zero_school_domain :
    Tendsto (fun x : ℝ => Real.sqrt x)
      (nhdsWithin 0 {x | 0 ≤ x ∧ 0 < x}) (𝓝 0) := by
  have hdomain : (0 : ℝ) ≤ 0 := by norm_num
  have hcont : ContinuousAt (fun x : ℝ => Real.sqrt x) 0 := by fun_prop
  convert tendsto_nhdsWithin_of_tendsto_nhds hcont.tendsto using 1 <;>
    simp <;> norm_num <;> ring

/-- Structural continuity broadens IVT beyond the original polynomial-only acceptance case. -/
theorem guarded_quotient_ivt_exists :
    ∃ c : ℝ, 0 ≤ c ∧ c ≤ 1 ∧ 1 / (c ^ 2 + 1) = (3 : ℝ) / 4 := by
  have hcont : ContinuousOn (fun c : ℝ => 1 / (c ^ 2 + 1)) (Set.Icc 0 1) := by
    intro c hmem
    have hden : c ^ 2 + 1 ≠ 0 := by positivity
    fun_prop
  have hlo : 1 / ((1 : ℝ) ^ 2 + 1) ≤ (3 : ℝ) / 4 := by norm_num
  have hhi : (3 : ℝ) / 4 ≤ 1 / ((0 : ℝ) ^ 2 + 1) := by norm_num
  have htarget : ((3 : ℝ) / 4) ∈
      Set.Icc ((fun c : ℝ => 1 / (c ^ 2 + 1)) 1)
        ((fun c : ℝ => 1 / (c ^ 2 + 1)) 0) := ⟨hlo, hhi⟩
  obtain ⟨c, hmem, hvalue⟩ :=
    intermediate_value_Icc' (by norm_num : (0 : ℝ) ≤ 1) hcont htarget
  exact ⟨c, hmem.1, hmem.2, by simpa using hvalue⟩

/-- Quantified interval evidence can discharge a quotient-domain guard inside IVT. -/
theorem quotient_ivt_with_quantified_guard
    (hden : ∀ t : ℝ, (0 ≤ t ∧ t ≤ 1) → t + 2 ≠ 0) :
    ∃ c : ℝ, 0 ≤ c ∧ c ≤ 1 ∧ 1 / (c + 2) = (2 : ℝ) / 5 := by
  have hcont : ContinuousOn (fun c : ℝ => 1 / (c + 2)) (Set.Icc 0 1) := by
    intro c hmem
    have hcden : c + 2 ≠ 0 := hden c hmem
    fun_prop
  have hlo : 1 / ((1 : ℝ) + 2) ≤ (2 : ℝ) / 5 := by norm_num
  have hhi : (2 : ℝ) / 5 ≤ 1 / ((0 : ℝ) + 2) := by norm_num
  have htarget : ((2 : ℝ) / 5) ∈
      Set.Icc ((fun c : ℝ => 1 / (c + 2)) 1)
        ((fun c : ℝ => 1 / (c + 2)) 0) := ⟨hlo, hhi⟩
  obtain ⟨c, hmem, hvalue⟩ :=
    intermediate_value_Icc' (by norm_num : (0 : ℝ) ≤ 1) hcont htarget
  exact ⟨c, hmem.1, hmem.2, by simpa using hvalue⟩


/-- Compositional finite-limit algebra builds the arithmetic `Tendsto` tree explicitly. -/
theorem compositional_limit_algebra_basic :
    Tendsto (fun x : ℝ => (x ^ 2 + 3 * x - 1) / (x + 1)) (𝓝[≠] 2) (𝓝 3) := by
  have hden : ((2 : ℝ) + 1) ≠ 0 := by norm_num
  have hx : Tendsto (fun x : ℝ => x) (𝓝[≠] 2) (𝓝 2) :=
    tendsto_id.mono_left nhdsWithin_le_nhds
  have hx2 : Tendsto (fun x : ℝ => x ^ 2) (𝓝[≠] 2) (𝓝 (2 ^ 2)) := by
    have houter : ContinuousAt (fun y : ℝ => y ^ 2) 2 := by fun_prop
    simpa [Function.comp_def] using houter.tendsto.comp hx
  have h3x : Tendsto (fun x : ℝ => 3 * x) (𝓝[≠] 2) (𝓝 (3 * 2)) :=
    tendsto_const_nhds.mul hx
  have hnum : Tendsto (fun x : ℝ => x ^ 2 + 3 * x - 1) (𝓝[≠] 2)
      (𝓝 ((2 ^ 2) + 3 * 2 - 1)) :=
    (hx2.add h3x).sub tendsto_const_nhds
  have hdenlim : Tendsto (fun x : ℝ => x + 1) (𝓝[≠] 2) (𝓝 (2 + 1)) :=
    hx.add tendsto_const_nhds
  convert hnum.div hdenlim hden using 1
  all_goals try { ext x <;> rfl }
  all_goals norm_num
  all_goals ring

/-- The same algebra tree keeps a one-sided source filter all the way through. -/
theorem compositional_limit_algebra_right :
    Tendsto (fun x : ℝ => Real.sin x + x ^ 2) (𝓝[>] 0) (𝓝 0) := by
  have hx : Tendsto (fun x : ℝ => x) (𝓝[>] 0) (𝓝 0) :=
    tendsto_id.mono_left nhdsWithin_le_nhds
  have hsin : Tendsto (fun x : ℝ => Real.sin x) (𝓝[>] 0) (𝓝 (Real.sin 0)) := by
    have houter : ContinuousAt (fun y : ℝ => Real.sin y) 0 := by fun_prop
    simpa [Function.comp_def] using houter.tendsto.comp hx
  have hx2 : Tendsto (fun x : ℝ => x ^ 2) (𝓝[>] 0) (𝓝 (0 ^ 2)) := by
    have houter : ContinuousAt (fun y : ℝ => y ^ 2) 0 := by fun_prop
    simpa [Function.comp_def] using houter.tendsto.comp hx
  convert hsin.add hx2 using 1 <;> simp

/-- A previously proved removable-hole limit can be reused as an opaque leaf in a larger tree. -/
theorem compositional_limit_reuses_hole :
    Tendsto (fun x : ℝ => (x ^ 2 - 9) / (x - 3) + Real.sin (x - 3))
      (𝓝[≠] 3) (𝓝 6) := by
  have hx : Tendsto (fun x : ℝ => x) (𝓝[≠] 3) (𝓝 3) :=
    tendsto_id.mono_left nhdsWithin_le_nhds
  have hshift : Tendsto (fun x : ℝ => x - 3) (𝓝[≠] 3) (𝓝 (3 - 3)) :=
    hx.sub tendsto_const_nhds
  have hsin : Tendsto (fun x : ℝ => Real.sin (x - 3)) (𝓝[≠] 3)
      (𝓝 (Real.sin (3 - 3))) := by
    have houter : ContinuousAt (fun y : ℝ => Real.sin y) (3 - 3) := by fun_prop
    simpa [Function.comp_def] using houter.tendsto.comp hshift
  convert removable_hole_limit.add hsin using 1 <;> simp

/-- Stronger positive evidence is explicitly converted to the nonzero quotient guard. -/
theorem compositional_limit_symbolic_denominator (a : ℝ) (ha : 0 < a) :
    Tendsto (fun x : ℝ => (x + 1) / a) (𝓝[≠] 0) (𝓝 (1 / a)) := by
  have hx : Tendsto (fun x : ℝ => x) (𝓝[≠] 0) (𝓝 0) :=
    tendsto_id.mono_left nhdsWithin_le_nhds
  have hnum : Tendsto (fun x : ℝ => x + 1) (𝓝[≠] 0) (𝓝 1) := by
    simpa using hx.add tendsto_const_nhds
  have hden : Tendsto (fun _x : ℝ => a) (𝓝[≠] 0) (𝓝 a) := tendsto_const_nhds
  exact hnum.div hden (ne_of_gt ha)


/-- A shifted reciprocal sequence converges to zero along `Nat.atTop`. -/
theorem sequence_reciprocal_shift_one :
    Tendsto (fun n : ℕ => (1 : ℝ) / (((n + 1 : ℕ) : ℝ))) atTop (𝓝 0) := by
  have hden : Tendsto (fun n : ℕ => (n : ℝ) + 1) atTop atTop :=
    tendsto_atTop_add_const_right atTop (1 : ℝ) tendsto_natCast_atTop_atTop
  have hnum : Tendsto (fun _ : ℕ => (1 : ℝ)) atTop (𝓝 1) := tendsto_const_nhds
  have hraw := hnum.div_atTop hden
  simpa [Nat.cast_add] using hraw

/-- Exact geometric ratios with absolute value below one converge to zero. -/
theorem sequence_geometric_half :
    Tendsto (fun n : ℕ => ((1 / 2 : ℝ) ^ n)) atTop (𝓝 0) := by
  exact tendsto_pow_atTop_nhds_zero_of_abs_lt_one (by norm_num)

/-- Symbolic geometric convergence keeps `|r| < 1` as explicit evidence. -/
theorem sequence_geometric_symbolic (r : ℝ) (hr : |r| < 1) :
    Tendsto (fun n : ℕ => r ^ n) atTop (𝓝 0) := by
  exact tendsto_pow_atTop_nhds_zero_of_abs_lt_one hr

/-- Sequence algebra composes a reciprocal tail, sine continuity and a geometric tail. -/
theorem sequence_composed_sin_geometric :
    Tendsto (fun n : ℕ => Real.sin (1 / (((n + 1 : ℕ) : ℝ))) + (1 / 2 : ℝ) ^ n)
      atTop (𝓝 0) := by
  have hrec : Tendsto (fun n : ℕ => (1 : ℝ) / (((n + 1 : ℕ) : ℝ))) atTop (𝓝 0) :=
    sequence_reciprocal_shift_one
  have hsin : Tendsto (fun n : ℕ => Real.sin (1 / (((n + 1 : ℕ) : ℝ))) )
      atTop (𝓝 (Real.sin 0)) := by
    have houter : ContinuousAt (fun y : ℝ => Real.sin y) 0 := by fun_prop
    simpa [Function.comp_def] using houter.tendsto.comp hrec
  have hgeo : Tendsto (fun n : ℕ => ((1 / 2 : ℝ) ^ n)) atTop (𝓝 0) :=
    sequence_geometric_half
  convert hsin.add hgeo using 1 <;> simp

/-- The natural index, shifted by a fixed natural constant then cast to reals, tends to +∞. -/
theorem sequence_nat_shift_two_atTop :
    Tendsto (fun n : ℕ => (((n + 2 : ℕ) : ℝ))) atTop atTop := by
  have h := tendsto_atTop_add_const_right atTop (2 : ℝ) tendsto_natCast_atTop_atTop
  simpa [Nat.cast_add] using h


/-- Same-degree linear rational sequences converge to one by isolating a reciprocal tail. -/
theorem sequence_rational_shift_one :
    Tendsto (fun n : ℕ => (n : ℝ) / ((n + 1 : ℕ) : ℝ)) atTop (𝓝 1) := by
  have hden : Tendsto (fun n : ℕ => (n : ℝ) + 1) atTop atTop :=
    tendsto_atTop_add_const_right atTop (1 : ℝ) tendsto_natCast_atTop_atTop
  have htail : Tendsto (fun n : ℕ => (-1 : ℝ) / ((n : ℝ) + 1)) atTop (𝓝 0) :=
    tendsto_const_nhds.div_atTop hden
  have hmain : Tendsto (fun n : ℕ => (1 : ℝ) + (-1 : ℝ) / ((n : ℝ) + 1)) atTop (𝓝 1) := by
    simpa using tendsto_const_nhds.add htail
  refine hmain.congr' ?_
  filter_upwards [] with n
  have hden0 : (n : ℝ) + 1 ≠ 0 := by positivity
  change (1 : ℝ) + (-1 : ℝ) / ((n : ℝ) + 1) = (n : ℝ) / ((n + 1 : ℕ) : ℝ)
  simp only [Nat.cast_add, Nat.cast_ofNat]
  field_simp [hden0]
  ring

/-- Eventual inequalities are translated into `Filter.Eventually` evidence before squeezing. -/
theorem sequence_squeeze_sin_over_shift
    (hlower : ∃ N : ℕ, ∀ n : ℕ, N ≤ n →
      (-1 : ℝ) / ((n + 1 : ℕ) : ℝ) ≤ Real.sin (n : ℝ) / ((n + 1 : ℕ) : ℝ))
    (hupper : ∃ N : ℕ, ∀ n : ℕ, N ≤ n →
      Real.sin (n : ℝ) / ((n + 1 : ℕ) : ℝ) ≤ (1 : ℝ) / ((n + 1 : ℕ) : ℝ)) :
    Tendsto (fun n : ℕ => Real.sin (n : ℝ) / ((n + 1 : ℕ) : ℝ)) atTop (𝓝 0) := by
  have hlo : Tendsto (fun n : ℕ => (-1 : ℝ) / ((n + 1 : ℕ) : ℝ)) atTop (𝓝 0) := by
    have hden : Tendsto (fun n : ℕ => (n : ℝ) + 1) atTop atTop :=
      tendsto_atTop_add_const_right atTop (1 : ℝ) tendsto_natCast_atTop_atTop
    have hnum : Tendsto (fun _ : ℕ => (-1 : ℝ)) atTop (𝓝 (-1)) := tendsto_const_nhds
    simpa [Nat.cast_add] using hnum.div_atTop hden
  have hhi : Tendsto (fun n : ℕ => (1 : ℝ) / ((n + 1 : ℕ) : ℝ)) atTop (𝓝 0) :=
    sequence_reciprocal_shift_one
  have hL : ∀ᶠ (n : ℕ) in atTop,
      (-1 : ℝ) / ((n + 1 : ℕ) : ℝ) ≤ Real.sin (n : ℝ) / ((n + 1 : ℕ) : ℝ) := by
    rcases hlower with ⟨N, hN⟩
    filter_upwards [eventually_ge_atTop N] with n hn
    exact hN n hn
  have hU : ∀ᶠ (n : ℕ) in atTop,
      Real.sin (n : ℝ) / ((n + 1 : ℕ) : ℝ) ≤ (1 : ℝ) / ((n + 1 : ℕ) : ℝ) := by
    rcases hupper with ⟨N, hN⟩
    filter_upwards [eventually_ge_atTop N] with n hn
    exact hN n hn
  exact tendsto_of_tendsto_of_tendsto_of_le_of_le' hlo hhi hL hU

/-- A nonconstant exact period-three sequence cannot have a finite real limit. -/
theorem sequence_period_three_no_finite_limit :
    ¬ ∃ l : ℝ, Tendsto (fun n : ℕ => ((if n % 3 = 0 then 0 else if n % 3 = 1 then 1 else 2) : ℝ))
      atTop (𝓝 l) := by
  rintro ⟨l, hlim⟩
  have h0Index : Tendsto (fun k : ℕ => 3 * k) atTop atTop := by
    refine tendsto_atTop.2 ?_
    intro b
    refine eventually_atTop.2 ⟨b, ?_⟩
    intro k hk
    omega
  have h1Index : Tendsto (fun k : ℕ => 3 * k + 1) atTop atTop := by
    refine tendsto_atTop.2 ?_
    intro b
    refine eventually_atTop.2 ⟨b, ?_⟩
    intro k hk
    omega
  have h0 := hlim.comp h0Index
  have h1 := hlim.comp h1Index
  have h0Const : Tendsto (fun _ : ℕ => (0 : ℝ)) atTop (𝓝 l) := by
    simpa [Function.comp_def, Nat.add_mod, Nat.mul_mod_right] using h0
  have h1Const : Tendsto (fun _ : ℕ => (1 : ℝ)) atTop (𝓝 l) := by
    simpa [Function.comp_def, Nat.add_mod, Nat.mul_mod_right] using h1
  have hl0 : l = 0 := tendsto_nhds_unique h0Const tendsto_const_nhds
  have hl1 : l = 1 := tendsto_nhds_unique h1Const tendsto_const_nhds
  norm_num [hl0] at hl1

/-- A vanishing perturbation does not repair the alternating sequence's nonconvergence. -/
theorem sequence_alternating_plus_reciprocal_no_finite_limit :
    ¬ ∃ l : ℝ, Tendsto (fun n : ℕ => (-1 : ℝ) ^ n + 1 / ((n + 1 : ℕ) : ℝ)) atTop (𝓝 l) := by
  rintro ⟨l, hlim⟩
  have htail : Tendsto (fun n : ℕ => (1 : ℝ) / ((n + 1 : ℕ) : ℝ)) atTop (𝓝 0) :=
    sequence_reciprocal_shift_one
  have hevenIndex : Tendsto (fun k : ℕ => 2 * k) atTop atTop := by
    refine tendsto_atTop.2 ?_
    intro b
    refine eventually_atTop.2 ⟨b, ?_⟩
    intro k hk
    omega
  have hoddIndex : Tendsto (fun k : ℕ => 2 * k + 1) atTop atTop := by
    refine tendsto_atTop.2 ?_
    intro b
    refine eventually_atTop.2 ⟨b, ?_⟩
    intro k hk
    omega
  have hevenTail := htail.comp hevenIndex
  have hoddTail := htail.comp hoddIndex
  have hevenFull : Tendsto (fun k : ℕ => (1 : ℝ) + 1 / ((2 * k + 1 : ℕ) : ℝ)) atTop (𝓝 l) := by
    simpa [Function.comp_def, pow_mul] using hlim.comp hevenIndex
  have hoddFull : Tendsto (fun k : ℕ => (-1 : ℝ) + 1 / (2 * (k : ℝ) + 1 + 1)) atTop (𝓝 l) := by
    simpa [Function.comp_def, pow_add, pow_mul, Nat.add_assoc, Nat.cast_add,
      add_assoc, add_left_comm, add_comm] using hlim.comp hoddIndex
  have hevenExpected : Tendsto (fun k : ℕ => (1 : ℝ) + 1 / ((2 * k + 1 : ℕ) : ℝ)) atTop (𝓝 1) := by
    simpa [Function.comp_def, Nat.add_assoc] using tendsto_const_nhds.add hevenTail
  have hoddExpected : Tendsto (fun k : ℕ => (-1 : ℝ) + 1 / (2 * (k : ℝ) + 1 + 1)) atTop (𝓝 (-1)) := by
    simpa [Function.comp_def, Nat.cast_add, Nat.add_assoc, add_assoc, add_left_comm,
      add_comm] using tendsto_const_nhds.add hoddTail
  have hl1 : l = 1 := tendsto_nhds_unique hevenFull hevenExpected
  have hlm1 : l = -1 := tendsto_nhds_unique hoddFull hoddExpected
  norm_num [hl1] at hlm1

/-- A monotone real sequence with an explicit upper bound has some finite limit. -/
theorem sequence_monotone_bounded_exists
    (f : ℕ → ℝ) (hmono : Monotone f) (hbdd : BddAbove (Set.range f)) :
    ∃ l : ℝ, Tendsto f atTop (𝓝 l) := by
  exact ⟨⨆ n, f n, tendsto_atTop_ciSup hmono hbdd⟩

/-- The dual antitone/bounded-below convergence theorem is exposed by the same proof contract. -/
theorem sequence_antitone_bounded_exists
    (f : ℕ → ℝ) (hanti : Antitone f) (hbdd : BddBelow (Set.range f)) :
    ∃ l : ℝ, Tendsto f atTop (𝓝 l) := by
  exact ⟨⨅ n, f n, tendsto_atTop_ciInf hanti hbdd⟩

end QuickMathsFormal
