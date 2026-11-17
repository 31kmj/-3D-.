# V10 표현 자산

이 폴더의 JPG/HDR 7개는 기존 `assets/version-3`에 보존된 Poly Haven CC0 일반 재질·환경광의 로컬 파생본입니다. 청계천 현장 촬영·측량 자료가 아닙니다. 원본과 이전 버전은 수정하지 않았습니다.

- 석재/포장 확산색·법선·거칠기 6개: 2048² → 1024². 확산색 JPEG quality90/4:4:4, 법선 벡터 재정규화 후 quality92/4:4:4, 거칠기는 grayscale quality88.
- 환경광: RGBE 원본 2048×1024 → 512×256. 선형 방사휘도에서 4×4 평균 후 RGBE RLE로 저장. 노출·색 변환 없음. 작은 광원과 세부 반사는 다운샘플링으로 차이가 생길 수 있으며 실제 외관은 브라우저 비교 대상입니다.
- 바이너리 7개 합계: 23,025,471 → 2,178,839 bytes, 90.54% 감소. 이는 파일 크기 비교이며 HTML·JS·manifest·HTTP 헤더를 포함한 실제 사이트 초기 전송량이나 속도 개선 수치가 아닙니다.
- `asset_manifest.json`: 원본 URL/취득일/라이선스/원본 SHA-256, 가공 방법·해상도, 파생본 SHA-256·바이트를 기록했습니다. 파생본이 원본 API 해시와 같다고 주장하지 않습니다.
- `derive_assets.py`: 재현용 로컬 가공 스크립트. 번들 Pillow·NumPy 사용, 원본 SHA-256 대조 후 새 파일만 생성합니다. 브라우저 구동에는 이 스크립트나 Python이 필요하지 않습니다.

라이선스: CC0-1.0. 출처와 조건은 각 asset의 원본 항목을 유지했습니다. 원본 출처 예: https://polyhaven.com/a/stone_wall_02 / https://polyhaven.com/a/pavement_05 / https://polyhaven.com/a/abandoned_parking ; https://polyhaven.com/license

`?quality=light`는 이 표현 자산 요청을 생략하고 기본 재질로 시작합니다. 필수 지도 자료와 시연용 수위는 동일합니다. 신규 배포·외부 전송은 수행하지 않았습니다.
