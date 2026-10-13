# Methods to calculate a 3D Position from noisy distances

Research for issue [#6](https://github.com/jtoniolo/bermuda-triangle/issues/6). Date: 2026-10-13.

Terms (from `CONTEXT.md`): **Scanner**, **Tracked device**, **Position**, **Floor**, **Elevation**.

Other terms in this file:

- **Residual**: the measured distance minus the distance from a candidate Position to a Scanner.
- **Jacobian**: the matrix of the partial derivatives of the residuals with respect to x, y and z.
- **Coplanar**: all points are on one plane.

## Summary

1. The three projects all use an iterative non-linear solver on the true distance residuals. None of them uses linear least squares.
2. BPS uses weighted non-linear least squares in 2D for each Floor (SciPy `least_squares`, bounded), and then a constant-velocity Kalman filter. It does not calculate z. It removes the height difference from each distance before the solve.
3. ESPresense-companion has many locators. The default configuration uses a weighted centroid (named "Nadaraya-Watson") and "nearest node". The Nelder-Mead locator is the fallback when no locator is enabled. All 3D locators keep the Position inside the 3D bounds of the Floor. A 3D Kalman filter smooths the output.
4. garnser/bermuda_trilateration uses non-linear least squares in 3D with RSSI-threshold weights (SciPy `least_squares`), mixes the result with a Random Forest prediction, and smooths with a fixed factor of 0.5. Its Kalman filter is an empty placeholder.
5. Scanners at almost the same height make z weak for all methods. With only 3 Scanners there are two mirror solutions. Bounds on z (the Floor Elevation and ceiling) are the usual fix in the projects.
6. For TypeScript, `ml-levenberg-marquardt` (MIT, TypeScript source, last release 2026-07-31) supports weights and bounds. `kalman-filter` (MIT, last release 2023-05-25) supports multi-dimension Kalman filters.

## 1. The usual methods

### 1.1 Linear least squares

- Each distance gives one sphere equation: `|x - s_i|^2 = d_i^2`. Each equation has the same term `|x|^2`. If you subtract one equation from the others, or treat `|x|^2` as an extra unknown, the system becomes linear. Beck, Stoica and Li call the second form the "unconstrained squared-range-based LS estimate (USR-LS)". It discards the quadratic constraint. ([Beck, Stoica, Li 2008, Section II-B](https://www.tau.ac.il/~becka/SLfinal.pdf))
- The squared-range methods are "suboptimal in the maximum likelihood sense", because the errors of squared ranges do not have a covariance that is proportional to the identity matrix. ([Beck, Stoica, Li 2008, Section II-B](https://www.tau.ac.il/~becka/SLfinal.pdf))
- The paper concludes that its exact SR-LS method "can be more accurate by several orders of magnitude than the approximate least squares solutions". ([Beck, Stoica, Li 2008, Section IV](https://www.tau.ac.il/~becka/SLfinal.pdf))
- Advantage: no start point and no iterations. Disadvantage: squaring the distances makes large distances (which have the most noise) count more. This second sentence is a derivation from the equation form, not a quote.

### 1.2 Non-linear least squares (Gauss-Newton, Levenberg-Marquardt)

- The range-based least squares (R-LS) problem minimizes the sum of squared residuals `sum (|x - s_i| - d_i)^2`. When the noise is Gaussian with a covariance proportional to the identity matrix, "the R-LS solution is in fact a maximum likelihood estimator". The problem is nonconvex. ([Beck, Stoica, Li 2008, Section II-A](https://www.tau.ac.il/~becka/SLfinal.pdf))
- Nonconvex means that an iterative solver can stop at a local minimum. A good start point is necessary. All three projects start from the centroid of the Scanners or from the previous Position (see Section 3).
- Levenberg-Marquardt is the method of [Levenberg 1944](https://doi.org/10.1090/qam/10666) and [Marquardt 1963](https://doi.org/10.1137/0111030). It mixes Gauss-Newton steps with gradient-descent steps through a damping value. ([ml-levenberg-marquardt option docs](https://github.com/mljs/levenberg-marquardt/blob/main/src/types.ts))
- SciPy `least_squares` has three methods. The default is `'trf'` (Trust Region Reflective), which supports bounds. The `'lm'` method "doesn't handle bounds" and "doesn't work when m < n" (fewer residuals than unknowns). ([SciPy docs](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.least_squares.html))
- SciPy also has robust loss functions for outliers: `soft_l1`, `huber`, `cauchy`, `arctan`. The default is `'linear'` (plain least squares). ([SciPy docs](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.least_squares.html))
- Thomas and Ros state that near singular geometry "the problem can be formulated as a nonlinear least-squares problem to identify the best approximate solution". ([Thomas, Ros 2005, Section I](https://www.iri.upc.edu/download/scidoc/743))

### 1.3 Weighted least squares

- Weighted least squares multiplies each squared residual by a weight. If the weight is `1 / variance_i`, the cost is `sum (residual_i^2 / (2 variance_i))` up to a constant. This is the negative log-likelihood of independent Gaussian errors. This is a derivation. The ESPresense-companion MLE locator uses exactly this cost ([MLEMultilateralizer.cs L24-L35](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/Locators/MLEMultilateralizer.cs#L24-L35)).
- Bermuda does not give a variance for each distance. It gives a smoothed distance from a log-distance path-loss formula `10 ^ ((ref_power - rssi) / (10 * attenuation))` ([Bermuda util.py L88-L108](https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/util.py#L88-L108)). The smoothing is a moving window that follows the lower values, with a velocity gate ([bermuda_advert.py L439-L479](https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/bermuda_advert.py#L439-L479)). Thus the add-on must use a proxy for the variance, for example `1 / d^2` (BPS and the ESPresense weighted centroid use this).
- I did not find a primary source that gives the variance of Bermuda distances as a function of distance. Do not use a specific number without a measurement.

### 1.4 Filters over time (Kalman filter)

- The Kalman filter is from [Kalman 1960](https://doi.org/10.1115/1.3662552). It predicts the state with a motion model, then corrects it with each new measurement, in proportion to the two uncertainties.
- Two forms are used in practice:
  - **Filter on the Position output** (a linear Kalman filter, measurement = solved Position). BPS and ESPresense-companion do this (Section 3).
  - **Filter on the raw distances** (an Extended Kalman filter, measurement = distances). This needs a linearized measurement model. I did not find this form in the three projects. The `kalman-filter` npm package supports an Extended Kalman filter ([README](https://github.com/piercus/kalman-filter)).
- A filter over time can continue with fewer Scanners than a single solve needs, because the motion model gives the missing information. This is a property of the method. I did not find a project that uses it this way.

## 2. Noise, fewer than four Scanners, and a weak z value

### 2.1 Noisy distances

| Method | Effect of noise |
|---|---|
| Linear LS (USR-LS) | Squared ranges amplify the noise of long distances. Not maximum likelihood. ([Beck et al. 2008](https://www.tau.ac.il/~becka/SLfinal.pdf)) |
| Non-linear LS | Maximum likelihood if the noise is Gaussian and equal. Can stop at a local minimum. ([Beck et al. 2008](https://www.tau.ac.il/~becka/SLfinal.pdf)) |
| Weighted LS | Same as non-linear LS, but uses less of the noisy Scanners. Needs a variance or a proxy. |
| Robust loss (Huber, Cauchy) | Reduces the effect of outliers. ([SciPy docs](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.least_squares.html)) |
| Kalman filter | Smooths over time. Needs a motion model and noise values. |

### 2.2 Fewer than four Scanners

- In 3D, three spheres give two points that are mirror images across the plane of the three Scanners. Thomas and Ros: "the sign accounts for the two mirror symmetric locations ... with respect to the base plane". ([Thomas, Ros 2005, text after equation 9](https://www.iri.upc.edu/download/scidoc/743))
- Thus three Scanners cannot give a unique 3D Position without more information. The usual extra information is a bound: the Tracked device is above the Floor surface and below the ceiling.
- With two Scanners, the solution is a circle. With one, it is a sphere. This is basic geometry.
- The linear method needs at least 4 Scanners that are not coplanar to solve x, y and z (n + 1 equations before subtraction for n = 3 unknowns, and a full-rank matrix). This is a derivation from the equation form. Beck et al. assume the matrix has "full column rank" ([Section II-B](https://www.tau.ac.il/~becka/SLfinal.pdf)).

### 2.3 Scanners at almost the same height (weak z)

- If all Scanners are at the same height, the linear system has a zero column for z. It cannot solve z. This is a derivation: after subtraction, the z coefficient of each row is `2 (z_i - z_1) = 0`.
- For the non-linear method, each Jacobian row is the unit vector from the Scanner to the candidate Position. If the Tracked device is near the plane of the Scanners, the z part of each row is near 0. Then `J^T J` is near singular in z. This is the same mechanism as dilution of precision in GPS: "If the tips of the receiver-satellite unit vectors lie in a plane, the DOP factors are infinitely large ... the matrix A^T A ... is singular". ([Langley 1999, GPS World](http://gauss.gge.unb.ca/papers.pdf/gpsworld.may99.pdf))
- Thomas and Ros state that the Jacobian is singular "in which the moving object is close to the base plane or the three stations are nearly aligned" ([Section I](https://www.iri.upc.edu/download/scidoc/743)). The bias error orthogonal to the base plane "exponentially increases as the robot reduces its distance to the base plane" ([text about Fig. 5](https://www.iri.upc.edu/download/scidoc/743)).
- Langley also shows that VDOP (vertical) is larger than HDOP (horizontal) when all signals come from one side (above) ([Langley 1999](http://gauss.gge.unb.ca/papers.pdf/gpsworld.may99.pdf)). In a home, most Scanners on one Floor are at a similar height, so the same effect applies.
- Fixes used in the projects:
  - **Solve in 2D and get z from the Floor.** BPS does this. It also removes the vertical part of each distance when the Scanner height is known: `horizontal = sqrt(slant^2 - dz^2)` ([BPS __init__.py L786-L801](https://github.com/Hogster/BPS/blob/10904c315ec0577c73eacd2f6ef00d294bab66d8/custom_components/bps/__init__.py#L786-L801)).
  - **Bound z to the Floor.** ESPresense-companion keeps x, y and z inside the 3D bounds of the Floor ([NelderMeadMultilateralizer.cs L43-L52](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/Locators/NelderMeadMultilateralizer.cs#L43-L52)).
  - **Remove collinear Scanners.** The ESPresense Gauss-Newton locator selects up to 4 Scanners that are not collinear ([GaussNewtonMultilateralizer.cs L91-L136](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/Locators/GaussNewtonMultilateralizer.cs#L91-L136)). It checks collinear, not coplanar.

## 3. Methods in the named projects

### 3.1 BPS (Hogster/BPS)

Source: commit [`10904c3`](https://github.com/Hogster/BPS/tree/10904c315ec0577c73eacd2f6ef00d294bab66d8) (2026-08-12).

- **Solver**: weighted non-linear least squares in 2D, with SciPy `least_squares` (default method `trf`). Residual: `sqrt((xi-x)^2 + (yi-y)^2) - ri`. Weight: `w / max(r, min_weight_radius)^2`. Start: centroid of the Scanners. Bounds: the extent of the Scanners and zones on the Floor, plus a 10% margin. ([__init__.py L2077-L2134](https://github.com/Hogster/BPS/blob/10904c315ec0577c73eacd2f6ef00d294bab66d8/custom_components/bps/__init__.py#L2077-L2134), [L904-L918](https://github.com/Hogster/BPS/blob/10904c315ec0577c73eacd2f6ef00d294bab66d8/custom_components/bps/__init__.py#L904-L918))
- **Noise**: a reading that changed much since the last update gets a lower weight `1 / (1 + ((rel - 1) / 0.5)^2)`. It is not removed. ([L884-L902](https://github.com/Hogster/BPS/blob/10904c315ec0577c73eacd2f6ef00d294bab66d8/custom_components/bps/__init__.py#L884-L902)) The 1/r^2 weight uses a minimum radius of 0.5 m, so that one near Scanner does not control the fit ([L152-L157](https://github.com/Hogster/BPS/blob/10904c315ec0577c73eacd2f6ef00d294bab66d8/custom_components/bps/__init__.py#L152-L157)).
- **Fewer Scanners**: it needs at least 3 Scanners on a Floor. With fewer, it does not solve that Floor ([L866](https://github.com/Hogster/BPS/blob/10904c315ec0577c73eacd2f6ef00d294bab66d8/custom_components/bps/__init__.py#L866), [L2098-L2100](https://github.com/Hogster/BPS/blob/10904c315ec0577c73eacd2f6ef00d294bab66d8/custom_components/bps/__init__.py#L2098-L2100)).
- **z**: not solved. It solves up to 3 candidate Floors, scores each fit, and elects a Floor with smoothing and hysteresis ([L160-L171](https://github.com/Hogster/BPS/blob/10904c315ec0577c73eacd2f6ef00d294bab66d8/custom_components/bps/__init__.py#L160-L171), [L819-L870](https://github.com/Hogster/BPS/blob/10904c315ec0577c73eacd2f6ef00d294bab66d8/custom_components/bps/__init__.py#L819-L870)). The Tracked device height is a fixed value, default 1.0 m above the Floor ([L151](https://github.com/Hogster/BPS/blob/10904c315ec0577c73eacd2f6ef00d294bab66d8/custom_components/bps/__init__.py#L151)).
- **Filter**: a 2D constant-velocity Kalman filter, state `[x, y, vx, vy]`, with piecewise white-noise acceleration. Measurement noise 1.5 m, acceleration noise 0.5 m/s^2. It resets after a Floor change or a gap of more than 30 s. ([L77-L95](https://github.com/Hogster/BPS/blob/10904c315ec0577c73eacd2f6ef00d294bab66d8/custom_components/bps/__init__.py#L77-L95), [L224-L287](https://github.com/Hogster/BPS/blob/10904c315ec0577c73eacd2f6ef00d294bab66d8/custom_components/bps/__init__.py#L224-L287))
- **Input**: Bermuda distance sensors.

### 3.2 ESPresense-companion

Source: commit [`b3ba848`](https://github.com/ESPresense/ESPresense-companion/tree/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e) (2026-10-13). Language: C#, with MathNet.Numerics 5.0.0 ([csproj L23](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/ESPresense.Companion.csproj#L23)).

- **Default configuration**: when no config file exists, the add-on copies `config.example.yaml` ([ConfigLoader.cs L35-L39](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/Services/ConfigLoader.cs#L35-L39)). That file enables `nadaraya_watson` and `nearest_node`, and disables `nelder_mead`, `bfgs`, `mle` and `multi_floor` ([config.example.yaml L57-L108](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/config.example.yaml#L57-L108)). If no locator is enabled, it uses Nelder-Mead ([State.cs L237-L244](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/Models/State.cs#L237-L244)).
- **"Nadaraya-Watson" locator**: a weighted centroid of the Scanner Positions, weight `1 / (d^2 + 1e-6)`. It does not minimize residuals. ([NadarayaWatsonMultilateralizer.cs L45-L63](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/Locators/NadarayaWatsonMultilateralizer.cs#L45-L63)). A weighted centroid is always inside the convex hull of the Scanners (a geometric fact).
- **Nelder-Mead locator**: 3D weighted least squares with a 4th unknown, a distance scale factor in [0.5, 1.5]. Residual: `|x - s_i| * scale - d_i`. Weights come from the rank of the Scanner (nearest first), with a Gaussian of sigma 0.3 by default. A penalty keeps the solution inside the Floor bounds. Solver: MathNet `NelderMeadSimplex(1e-7, 10000)`. ([NelderMeadMultilateralizer.cs L22-L71](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/Locators/NelderMeadMultilateralizer.cs#L22-L71), [GaussianWeighting.cs](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/Weighting/GaussianWeighting.cs))
- **MLE locator**: same structure, but the cost is `error^2 / (2 * variance)`, with the variance reported for each Scanner (`DistVar`) ([MLEMultilateralizer.cs L24-L35](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/Locators/MLEMultilateralizer.cs#L24-L35)).
- **BFGS locator**: MathNet `BfgsBMinimizer` (bounded) on weighted squared residuals ([BfgsMultilateralizer.cs](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/Locators/BfgsMultilateralizer.cs)).
- **Gauss-Newton locator**: a class exists, with damping 1e-3 and clamping to the bounds ([GaussNewtonMultilateralizer.cs L140-L194](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/Locators/GaussNewtonMultilateralizer.cs#L140-L194)). `State.cs` does not create it, so it is not in use ([State.cs L206-L236](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/Models/State.cs#L206-L236)). Its Jacobian is `2 (x - s_i)`, which is the Jacobian of the squared distance, not of the residual `|x - s_i| - d_i` that it uses.
- **Fewer Scanners**: with 0 or 1 Scanner, no result. With 2, or with fewer than 3 for the solvers, the result is the midpoint of the 2 nearest Scanners with confidence 1 ([BaseMultilateralizer.cs L32-L59](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/Locators/BaseMultilateralizer.cs#L32-L59), [NelderMeadMultilateralizer.cs L32-L36](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/Locators/NelderMeadMultilateralizer.cs#L32-L36)).
- **z**: solved in 3D, but bounded by the 3D bounds of each Floor. Each Floor is a separate "scenario" ([State.cs L215-L225](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/Models/State.cs#L215-L225)).
- **Filter and selection**: each scenario has a 3D constant-velocity Kalman filter (state x, y, z, vx, vy, vz). If a jump is faster than `max_velocity` (default 0.5 m/s), the measurement noise is multiplied by the square of the excess ([KalmanLocation.cs L95-L130](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/Models/KalmanLocation.cs#L95-L130), [KalmanFilterSettings.cs L22](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/Models/KalmanFilterSettings.cs#L22)). A service then picks the scenario with the highest smoothed probability ([MultiScenarioLocator.cs L12-L22](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/Services/MultiScenarioLocator.cs#L12-L22)).
- **Confidence**: from the error, the Pearson correlation of measured and calculated distances, and the number of Scanners ([BaseMultilateralizer.cs L89-L106](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/Locators/BaseMultilateralizer.cs#L89-L106), [NelderMeadMultilateralizer.cs L88-L98](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/Locators/NelderMeadMultilateralizer.cs#L88-L98)).

### 3.3 garnser/bermuda_trilateration

Source: commit [`f284e0e`](https://github.com/garnser/bermuda_trilateration/tree/f284e0ef964524fbaeb7a5b553fa2c5f766981c5) (2025-03-21). This is the last commit.

- **Input**: raw RSSI from MQTT topic `bermuda/{mac}/scanner/+/rssi`, not Bermuda distances ([config.py L9](https://github.com/garnser/bermuda_trilateration/blob/f284e0ef964524fbaeb7a5b553fa2c5f766981c5/config.py#L9)). It uses the median of recent RSSI values and its own path-loss formula with `n = 2.0` ([utils.py L13-L15](https://github.com/garnser/bermuda_trilateration/blob/f284e0ef964524fbaeb7a5b553fa2c5f766981c5/utils.py#L13-L15)).
- **Solver**: 3D non-linear least squares with SciPy `least_squares` (default method `trf`, no bounds). Start: centroid of the Scanners. ([positioning.py L10-L19](https://github.com/garnser/bermuda_trilateration/blob/f284e0ef964524fbaeb7a5b553fa2c5f766981c5/positioning.py#L10-L19))
- **Weights**: 1.5, 1.0 or 0.3 from RSSI thresholds ([positioning.py L86-L92](https://github.com/garnser/bermuda_trilateration/blob/f284e0ef964524fbaeb7a5b553fa2c5f766981c5/positioning.py#L86-L92)). The code also multiplies each distance by its weight before the solve ([positioning.py L178](https://github.com/garnser/bermuda_trilateration/blob/f284e0ef964524fbaeb7a5b553fa2c5f766981c5/positioning.py#L178)). This changes the measured distance, not only its weight.
- **Fewer Scanners**: trilateration needs at least 3 Scanners. With fewer, only the machine-learning prediction is used ([positioning.py L180-L211](https://github.com/garnser/bermuda_trilateration/blob/f284e0ef964524fbaeb7a5b553fa2c5f766981c5/positioning.py#L180-L211)).
- **Fusion**: a `RandomForestRegressor` (100 trees) predicts the Position from RSSI values ([ml_model.py L97](https://github.com/garnser/bermuda_trilateration/blob/f284e0ef964524fbaeb7a5b553fa2c5f766981c5/ml_model.py#L97)). The result is a mix of the two estimates. The trilateration weight goes from 0.7 (RMS error <= 1 m) to 0 (RMS error >= 5 m) ([positioning.py L49-L65](https://github.com/garnser/bermuda_trilateration/blob/f284e0ef964524fbaeb7a5b553fa2c5f766981c5/positioning.py#L49-L65), [config.py L33-L39](https://github.com/garnser/bermuda_trilateration/blob/f284e0ef964524fbaeb7a5b553fa2c5f766981c5/config.py#L33-L39)).
- **z**: solved in 3D without bounds. The Floor is `int(z // 3)`, so a Floor height of 3 m is fixed in code ([utils.py L49](https://github.com/garnser/bermuda_trilateration/blob/f284e0ef964524fbaeb7a5b553fa2c5f766981c5/utils.py#L49)). I found no special handling of a weak z value.
- **Filter**: `apply_filtering` is a placeholder that returns the input ([utils.py L57-L62](https://github.com/garnser/bermuda_trilateration/blob/f284e0ef964524fbaeb7a5b553fa2c5f766981c5/utils.py#L57-L62)). The output uses exponential smoothing with alpha 0.5 ([positioning.py L229-L234](https://github.com/garnser/bermuda_trilateration/blob/f284e0ef964524fbaeb7a5b553fa2c5f766981c5/positioning.py#L229-L234)).

### 3.4 Comparison

| | BPS | ESPresense-companion | bermuda_trilateration |
|---|---|---|---|
| Dimensions | 2D per Floor | 3D per Floor | 3D |
| Solver | SciPy `least_squares` (trf) | Weighted centroid (default); Nelder-Mead, BFGS, MLE (options) | SciPy `least_squares` (trf) |
| Weights | `1/r^2` x jump weight | rank-based Gaussian; `1/d^2` (centroid); `1/variance` (MLE) | RSSI thresholds |
| Bounds | Floor extent (x, y) | Floor 3D bounds | None |
| Minimum Scanners | 3 | 3 (2 gives a midpoint) | 3 (else ML only) |
| z handling | Floor election, slant correction | z bounded to the Floor | none |
| Time filter | 2D CV Kalman | 3D CV Kalman | EMA, alpha 0.5 |
| Last commit | 2026-08-12 | 2026-10-13 | 2025-03-21 |

## 4. TypeScript and JavaScript libraries

Data from the npm registry and the GitHub API on 2026-10-13.

| Package | Latest version (date) | License | Types | What it does | Status |
|---|---|---|---|---|---|
| [`ml-levenberg-marquardt`](https://github.com/mljs/levenberg-marquardt) | 5.1.0 (2026-07-31) | MIT | TypeScript source and `.d.ts` | Levenberg-Marquardt. Options: `weights`, `minValues`, `maxValues`, `damping`, optional analytic Jacobian. ([types.ts](https://github.com/mljs/levenberg-marquardt/blob/main/src/types.ts)) | Active. Last push 2026-09-13. |
| [`ml-matrix`](https://github.com/mljs/matrix) | 6.15.0 (2026-08-05) | MIT | Yes | Matrix operations, SVD, QR, pseudo-inverse. Use it for linear LS or your own Kalman filter. | Active. |
| [`fmin`](https://github.com/benfred/fmin) | 0.0.4 (2024-10-29) | BSD-3-Clause | No `.d.ts` in the package | Nelder-Mead, conjugate gradient, gradient descent. No bounds. ([index.js](https://github.com/benfred/fmin/blob/master/index.js)) | Low activity. Last push 2024-10-29. |
| [`multilateration`](https://github.com/vasturiano/multilateration) | 0.7.1 (2023-02-08) | MIT | Yes | `locate(beacons, options)`. Geometry: `2d`, `3d` or `earth`. Method: `lse`, `lseInside` or `circleSizing`. Uses `fmin` Nelder-Mead. The API has no weights. | Inactive since 2023-02-08. About 22 downloads a week. |
| [`kalman-filter`](https://github.com/piercus/kalman-filter) | 2.3.0 (2023-05-25) | MIT | No `.d.ts` in the package | Multi-dimension Kalman filter and Extended Kalman filter. Has a `constant-speed` dynamic model. | Last npm release 2023-05-25. Last push 2024-11-14. |
| [`kalmanjs`](https://github.com/wouterbulten/kalmanjs) | 1.1.0 (2019-01-20) | LGPL-3.0 | No | 1D Kalman filter only. | Inactive. |
| [`node-trilateration`](https://github.com/mberberoglu/node-trilateration) | 1.0.0 (2017-03-29) | MIT | No | Closed-form 2D solution from the first 3 beacons only. It divides by `y0 - y1` and `y0 - y2`, so it fails when two beacons have the same y. ([index.js](https://github.com/mberberoglu/node-trilateration/blob/master/index.js)) | Inactive since 2017. Not suitable. |
| `trilateration` | 0.0.1 (2014-11-12) | none | No | Not examined. | Inactive since 2014. |

How to use `ml-levenberg-marquardt` for trilateration (from its API): use the Scanner index as `x`, the measured distance as `y`, and a function `([px, py, pz]) => (i) => distance(p, scanner[i])`. Give `minValues` and `maxValues` to bound z to the Floor. This is a usage note from the type definitions. I did not run it.

## 5. Recommendation from the findings

This section is a conclusion from the facts above. It is not a quote.

1. Use weighted non-linear least squares on the true residuals `|x - s_i| - d_i`. Use bounds. In TypeScript, `ml-levenberg-marquardt` supports this.
2. Weight each Scanner by a proxy for `1 / variance`, for example `1 / max(d, 0.5 m)^2` (as in BPS). Bermuda gives no variance.
3. Bound z to the Floor: from its Elevation to the ceiling. Start from the centroid of the Scanners, or from the last Position.
4. If the Scanners on a Floor are almost at the same height, solve x and y, and set z from the Floor (BPS method). Or fix z to a typical height (BPS uses 1.0 m).
5. With 3 Scanners, use the bounds to remove the mirror solution. With 2 or fewer, do not report a new Position from the solver. Use the filter prediction or keep the last Position.
6. Smooth the output with a constant-velocity Kalman filter. Both BPS and ESPresense-companion do this. Bermuda already smooths each distance, so the filter can trust each fix more (BPS comment, [L84-L89](https://github.com/Hogster/BPS/blob/10904c315ec0577c73eacd2f6ef00d294bab66d8/custom_components/bps/__init__.py#L84-L89)).
7. Do not use linear least squares as the final result. It can be a start point.

## Open questions

- The real noise of Bermuda distances as a function of distance: no primary source found.
- Whether an Extended Kalman filter on raw distances is better than a filter on the solved Position, for Bermuda data: no comparison found.
