"""Inspect the selected build SDK; never install tools or start the app."""

import argparse
import json
import os
import platform
import re
import subprocess
from pathlib import Path


def properties(source):
    return dict(line.split("=", 1) for line in source.splitlines() if "=" in line)


def command(file, *args):
    result = subprocess.run(
        [str(file), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="strict",
        check=True,
        timeout=30,
    )
    return (result.stdout + result.stderr).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--outputs", action="store_true")
    args = parser.parse_args()
    profile = json.loads(
        (Path(__file__).resolve().parents[1] / "android-runtime.json").read_text(
            encoding="utf-8"
        )
    )
    if profile["schema_version"] != 1 or platform.python_version() != profile["python"]:
        raise RuntimeError(
            "Select the exact metadata interpreter from android-runtime.json"
        )
    for version in [profile["java"]["version"], profile["android"]["build_tools"]]:
        if not re.fullmatch(r"\d+(?:\.\d+)*", version):
            raise RuntimeError("SDK versions must be stable numeric releases")
    android = profile["android"]
    if (
        not re.fullmatch(r"android-\d+\.\d+", android["platform"])
        or android["platform"] != f"android-{android['major']}.{android['minor']}"
    ):
        raise RuntimeError("Android platform fields must identify the same SDK")
    if args.outputs:
        for name, value in {
            "java-version": profile["java"]["version"],
            "android-platform": android["platform"],
            "android-build-tools": android["build_tools"],
        }.items():
            print(name + "=" + value)
        return
    java_home = Path(os.environ["JAVA_HOME"])
    sdk = Path(os.environ["ANDROID_HOME"])
    suffix = ".exe" if os.name == "nt" else ""
    compiler = command(java_home / ("bin/javac" + suffix), "--version")
    java = command(
        java_home / ("bin/java" + suffix), "-XshowSettings:properties", "-version"
    )
    actual = dict(re.findall(r"^\s*(java\.[\w.]+)\s*=\s*(.*?)\s*$", java, re.MULTILINE))
    if compiler != "javac " + profile["java"]["version"]:
        raise RuntimeError(
            "Compiler differs from the selected stable release: " + compiler
        )
    if (
        actual.get("java.runtime.version") != profile["java"]["runtime"]
        or actual.get("java.vendor.version") != profile["java"]["vendor_version"]
    ):
        raise RuntimeError("The exact current free Zulu build is required")
    package = sdk / "platforms" / android["platform"]
    source = (package / "source.properties").read_text(encoding="utf-8")
    build_source = (
        sdk / "build-tools" / android["build_tools"] / "source.properties"
    ).read_text(encoding="utf-8")
    values = properties(source)
    if (
        not (package / "android.jar").is_file()
        or values.get("AndroidVersion.ApiLevel")
        != f"{android['major']}.{android['minor']}"
        or values.get("AndroidVersion.PreviewSdkInt") != "0"
        or values.get("AndroidVersion.CodeName")
        or values.get("AndroidVersion.BetaVersion")
        or properties(build_source).get("Pkg.Revision") != android["build_tools"]
    ):
        raise RuntimeError(
            "Expected the selected final Android platform and build tools"
        )
    print(
        json.dumps(
            {
                "profile": profile,
                "python": platform.python_version(),
                "compiler": compiler,
                "java_properties": actual,
                "platform_properties": source,
                "build_tools_properties": build_source,
                "application_started": False,
                "operator_sdk_changed": False,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
