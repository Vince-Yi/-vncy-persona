# Project Rules

## Release & CI

- `package-lock.json`은 항상 커밋에 포함할 것
    - `.github/workflows/publish.yml`이 `npm ci`를 사용하므로 누락 시 CI 실패
- npm 배포 워크플로(`publish.yml`)는 **`v*` 태그 푸시 시에만 트리거**됨
    - 버전 bump 후 반드시 `git tag v{version} && git push origin v{version}` 실행
