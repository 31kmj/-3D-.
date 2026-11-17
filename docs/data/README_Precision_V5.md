# V5 데이터 읽기

- `scene_precision_v5.json`: 기존 OSM 본체399개 + 부속체12개. 모든 지형/물/계단/교량 Y는 가정. 부속체 높이 태그도 현장 미검증. 이 가공 OSM 데이터베이스는 ODbL1.0.
- `building_parts_v5.geojson`: WGS84 위경도 형상과 높이 근거. 높이는 지역 지면을 기준으로 한 시각 표현 입력이며 국가 수직 기준 표고가 아니다.
- `official_facilities_v5.json`, `.geojson`: 서울시설공단 공식 웹 지도에 공개된 사실 좌표/명칭. 주변 포함18레코드, 고유 시설18개나 전체 출구 수를 뜻하지 않는다. 경사로2·엘리베이터1·일반 화장실9·장애인 화장실6. 후자의 일부는 같은 시설일 수 있다.
- 공식 자료는 출처/페이지의 공공누리 출처표시 표식을 기록했으며, SDK·지도 타일·사진을 복사한 레이어가 아니다. 좌표의 원 준거계 상세·정확도·현재 운영은 미확인. 폭/표고/경사는 null. 오류3행과 중복11행은 JSON에서 확인한다. 격리 값을 추측 교정하지 않았다.
- `detail_context_v4.json`: OSM 수목/수목열/벤치/횡단노드. 형상·크기·방향·표고는 절차적 가정. 수목열 보간 개수를 실제 수목 수로 읽으면 안 된다.

OSM: https://www.openstreetmap.org/copyright / https://opendatacommons.org/licenses/odbl/1-0/ . 공식 시설 원문: https://www.sisul.or.kr/open_content/cheonggye/enjoy/restroom1.jsp . 교량: https://www.sisul.or.kr/open_content/cheonggye/intro/sculpture.jsp . 상세 출처·해시·추출·한계는 프로젝트 `01_Research/version-5/`를 참고한다.
