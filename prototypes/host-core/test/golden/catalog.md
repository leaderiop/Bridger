# Catalog

## Services

| Service | Kind | Version | Methods | Provided by | Required by |
| --- | --- | --- | --- | --- | --- |
| `example/Board@1` | contract | 1.2.0 | post (5000 ms) | board | - |
| `example/Db` | plain | - | - | db | board |

## Configuration

| Plugin | Field | Type | Required | Volatile |
| --- | --- | --- | --- | --- |
| board | `limit` | number | no | yes |
| board | `title` | string | yes | no |

## Contributions

| Registry | Id | Role | Plugin |
| --- | --- | --- | --- |
| `example/price-change` | `board/guard` | veto | board |
