from scripts.export_web_curriculum import _media_report


def test_native_media_report_deduplicates_assets_and_preserves_budget_arithmetic():
    assets = {
        "media/a.png": {"bytes": 7},
        "media/b.svg": {"bytes": 13},
    }
    attributions = {
        "subdomain": {"algebra": {"bytes": 7, "asset_count": 1}, "geometry": {"bytes": 13, "asset_count": 1}},
        "branch": {"core": {"bytes": 20, "asset_count": 2}},
        "source_folder": {"content/math": {"bytes": 20, "asset_count": 2}},
    }

    report = _media_report(budget=100, assets=assets, attributions=attributions)

    assert report["total_bytes"] == 20
    assert report["remaining_bytes"] == 80
    assert report["asset_count"] == 2
    assert report["by_branch"]["core"] == {"bytes": 20, "asset_count": 2}


def test_native_media_report_is_deterministically_sorted():
    assets = {"b": {"bytes": 2}, "a": {"bytes": 1}}
    attributions = {
        "subdomain": {"z": {"bytes": 2, "asset_count": 1}, "a": {"bytes": 1, "asset_count": 1}},
        "branch": {"core": {"bytes": 3, "asset_count": 2}},
        "source_folder": {"folder": {"bytes": 3, "asset_count": 2}},
    }

    assert list(_media_report(budget=3, assets=assets, attributions=attributions)["by_subdomain"]) == ["a", "z"]
