"""Conceptual statistics and probability illustrations for native lessons."""
import math
import numpy as np
from scripts.illustration_drawing import *


def _hist(ax, data, title, xlabel="value"):
    axes(ax, (0, 11), (0, 7), title, xlabel, "count")
    ax.hist(data, bins=np.arange(.5, 11.5), color=MINT, edgecolor=PINE, linewidth=1.5)


def draw(ax, id):
    if id == "MATH_STAT_001":
        axes(ax, (0, 11), (0, 7), "Center and spread describe a distribution", "observed value", "frequency")
        data = np.array([2, 3, 3, 4, 4, 4, 5, 5, 6, 9])
        for value in sorted(set(data)):
            count = int(np.count_nonzero(data == value))
            ax.scatter([value] * count, np.arange(1, count + 1), s=75, color=PINE)
        ax.axvline(np.mean(data), color=CORAL, lw=3, label="mean = 4.5")
        ax.axvline(np.median(data), color=BLUE, lw=3, ls="--", label="median = 4")
        ax.annotate("outlier", (9, 1), xytext=(8, 3), arrowprops={"arrowstyle": "->", "color": CORAL}, fontsize=18, color=PINE)
        ax.legend(fontsize=16, loc="upper left")
    elif id == "MATH_STAT_002":
        _hist(ax, [1, 2, 2, 2, 3, 3, 4, 5, 5, 6, 7, 8, 9], "A histogram groups numerical values")
        ax.text(5.2, 6.1, "bins turn a list into a shape", ha="center", fontsize=18, color=PINE)
    elif id == "MATH_STAT_003":
        axes(ax, (0, 10), (0, 10), "Association is visible in a scatter plot", "x", "y")
        x = np.arange(1, 10); y = np.array([1.4, 2.1, 2.3, 4.0, 4.1, 5.4, 6.0, 7.2, 8.1])
        ax.scatter(x, y, color=PINE, s=65); coef = np.polyfit(x, y, 1)
        ax.plot(x, np.polyval(coef, x), color=CORAL, lw=3, label="linear model")
        ax.axhline(0, color=MUTED, lw=1); ax.legend(fontsize=16)
    elif id == "MATH_STAT_004":
        axes(ax, (-3.5, 3.5), (0, .45), "A normal model is centered and symmetric", "z-score", "density")
        x = np.linspace(-3.5, 3.5, 240); y = np.exp(-x*x/2) / np.sqrt(2*np.pi)
        ax.plot(x, y, color=PINE, lw=3); ax.fill_between(x, y, where=(x >= -1) & (x <= 1), color=MINT, alpha=.9)
        ax.text(0, .29, "about 68%\nwithin 1 SD", ha="center", fontsize=18, color=PINE)
    elif id == "MATH_STAT_005":
        axes(ax, (0, 10), (0, .75), "Sample means vary less than individual values", "sample mean", "density")
        rng = np.random.default_rng(4); means = rng.normal(5, .65, 400)
        ax.hist(means, bins=18, density=True, color=MINT, edgecolor=PINE); ax.axvline(5, color=CORAL, lw=3)
        ax.text(5, .68, "standard error shrinks as n grows", ha="center", fontsize=18, color=PINE)
    elif id == "MATH_STAT_006":
        canvas(ax, "An interval estimates a population value")
        ax.plot([2, 8], [3.5, 3.5], color=MUTED, lw=3); ax.plot([3, 7], [3.5, 3.5], color=CORAL, lw=8, solid_capstyle="round")
        ax.scatter([5], [3.5], color=PINE, s=100, zorder=3); text(ax, 5, 4.6, "estimate", 20); text(ax, 5, 2.2, "confidence interval", 21)
        text(ax, 3, 3, "lower", 17); text(ax, 7, 3, "upper", 17)
    elif id == "MATH_STAT_007":
        axes(ax, (-3.5, 3.5), (0, .45), "A p-value is tail area under the null model", "test statistic", "null density")
        x = np.linspace(-3.5, 3.5, 240); y = np.exp(-x*x/2) / np.sqrt(2*np.pi)
        ax.plot(x, y, color=PINE, lw=3); ax.fill_between(x, y, where=(x >= 2) | (x <= -2), color=CORAL, alpha=.65); ax.axvline(2, color=CORAL, ls="--", lw=2); ax.axvline(-2, color=CORAL, ls="--", lw=2)
        ax.text(0, .32, "extreme outcomes", ha="center", fontsize=18, color=PINE)
    elif id == "MATH_STAT_008":
        axes(ax, (-4, 4), (0, .45), "The t distribution has heavier tails", "t statistic", "density")
        x = np.linspace(-4, 4, 240); normal = np.exp(-x*x/2)/np.sqrt(2*np.pi); df = 5
        t = np.exp(math.lgamma((df + 1) / 2) - math.lgamma(df / 2)) / np.sqrt(df * np.pi) * (1 + x*x/df) ** (-(df + 1) / 2)
        ax.plot(x, normal, color=BLUE, lw=2.5, label="normal"); ax.plot(x, t, color=CORAL, lw=3, label="t, small df"); ax.legend(fontsize=16)
    elif id == "MATH_STAT_009":
        axes(ax, (0, 10), (0, 10), "Compare means by looking at their difference", "group", "response")
        ax.errorbar([3, 7], [5.2, 6.6], yerr=[.8, .9], fmt="o", color=PINE, capsize=8, ms=9, label="95% CI")
        ax.plot([3, 7], [5.2, 6.6], color=CORAL, ls="--"); text(ax, 5, 2, "difference of means", 20)
        ax.set_xticks([3, 7], ["A", "B"]); ax.legend(fontsize=15)
    elif id == "MATH_STAT_010":
        canvas(ax, "A proportion is a count divided by its total")
        for i in range(10):
            ax.add_patch(Rectangle((1 + i*.8, 3), .75, 1.2, facecolor=MINT if i < 6 else PAPER, edgecolor=PINE, lw=1.5))
        text(ax, 5, 2, "6 successes / 10 trials = 0.60", 22); text(ax, 5, 5.5, "sample proportion", 23)
    elif id == "MATH_STAT_011":
        axes(ax, (0, 9), (0, 17), "Chi-square compares observed with expected counts", "category", "count")
        x = np.arange(1, 5); ax.bar(x-.18, [12, 8, 15, 5], .36, color=CORAL, label="observed"); ax.bar(x+.18, [10, 10, 10, 10], .36, color=MINT, edgecolor=PINE, label="expected"); ax.set_xticks(x); ax.legend(fontsize=15)
    elif id == "MATH_STAT_012":
        canvas(ax, "A two-way table compares conditional proportions")
        cells = [[18, 12], [9, 21]]
        for r, row in enumerate(cells):
            for c, value in enumerate(row):
                ax.add_patch(Rectangle((2+c*2.2, 3.1-r*1.5), 2.1, 1.4, facecolor=MINT if value > 15 else "#eedcb9", edgecolor=PINE, lw=2)); text(ax, 3.05+c*2.2, 3.8-r*1.5, str(value), 24)
        text(ax, 5, 5.7, "outcome 1     outcome 2", 17); text(ax, 1.0, 3.8, "group A", 16); text(ax, 1.0, 2.3, "group B", 16)
        text(ax, 5, 1, "within-row percentages: 60% vs 30%", 18)
    elif id == "MATH_STAT_013":
        axes(ax, (0, 10), (0, 10), "A slope test asks whether a line is flat", "predictor", "response")
        x = np.arange(1, 10); y = 1 + .7*x + np.array([.4, -.4, .2, -.2, .3, -.3, .1, -.1, .2]); ax.scatter(x, y, color=PINE, s=60); ax.plot(x, 1+.7*x, color=CORAL, lw=3); ax.text(5, 1, "slope = 0 is the null claim", ha="center", fontsize=18, color=PINE)
    elif id == "MATH_STAT_014":
        axes(ax, (0, 4), (0, 10), "ANOVA compares variation between groups", "group", "value")
        for i, vals in enumerate([[3, 4, 4.5], [5.5, 6, 6.5], [7, 8, 8.5]], 1): ax.scatter([i]*3, vals, s=70, color=PINE)
        ax.scatter([1, 2, 3], [3.8, 6, 7.8], color=CORAL, s=120, marker="_", linewidths=4); text(ax, 2, 1, "within-group spread vs between-group spread", 17)
    elif id == "MATH_STAT_015":
        axes(ax, (0, 10), (0, 10), "Partial effects hold other predictors fixed", "x₁", "response")
        x = np.linspace(1, 9, 60); ax.plot(x, 1+.7*x, color=PINE, lw=3, label="same x₂"); ax.plot(x, 3+.7*x, color=CORAL, lw=3, label="different x₂"); ax.legend(fontsize=16)
    elif id == "MATH_STAT_016":
        axes(ax, (0, 10), (0, .75), "Resampling builds an empirical sampling distribution", "resampled statistic", "density")
        rng = np.random.default_rng(7); values = rng.normal(5, .8, 500); ax.hist(values, bins=20, density=True, color=MINT, edgecolor=PINE); ax.axvline(5, color=CORAL, lw=3); text(ax, 5, .68, "repeat: sample → statistic", 19)
    elif id == "MATH_PROB_001":
        canvas(ax, "A sample space lists possible outcomes")
        for i, label in enumerate(["H", "T"]): box(ax, 2+i*4, 3, 2, 1.4, label)
        text(ax, 5, 1.7, "events are subsets of the sample space", 20)
    elif id == "MATH_PROB_002":
        canvas(ax, "Conditional probability narrows the reference group")
        ax.add_patch(Rectangle((1, 1.3), 8, 4.2, facecolor=MINT, edgecolor=PINE, lw=2)); ax.add_patch(Rectangle((5, 1.3), 4, 4.2, facecolor="#eedcb9", edgecolor=CORAL, lw=2)); ax.add_patch(Rectangle((6.3, 2.2), 2.1, 2.4, facecolor=CORAL, alpha=.75, edgecolor=PINE, lw=2)); text(ax, 3, 3.4, "all outcomes", 21); text(ax, 7, 1.8, "B", 20); text(ax, 7.35, 3.4, "A ∩ B", 19); text(ax, 5, .7, "P(A | B) = P(A ∩ B) / P(B)", 20)
    elif id == "MATH_PROB_003":
        axes(ax, (0, 5), (0, .5), "Expected value is a probability-weighted average", "outcome", "probability")
        x = np.arange(1, 5); p = [.1, .2, .4, .3]; ax.bar(x, p, color=MINT, edgecolor=PINE); ax.axvline(np.dot(x, p), color=CORAL, lw=3, label="E[X] = 2.9"); ax.legend(fontsize=16)
    elif id == "MATH_PROB_004":
        canvas(ax, "Counting choices multiply across stages")
        flow(ax, "", ["3 shirts", "× 2 pants", "= 6 outfits"], "Each first choice pairs with every second choice.")
    elif id == "MATH_PROB_005":
        axes(ax, (0, 10), (0, .3), "A binomial model counts successes in fixed trials", "number of successes", "probability")
        x = np.arange(0, 11); p = np.array([math.comb(10, int(k))*.5**10 for k in x]); ax.bar(x, p, color=MINT, edgecolor=PINE); ax.set_xticks(x)
    else:
        raise ValueError(id)
