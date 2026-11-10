// 꿈 일기와 설정을 이 컴퓨터의 data 폴더에 저장 (인터넷에 올라가지 않음)
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function createStore(dir) {
  const file = (name) => path.join(dir, name);
  let queue = Promise.resolve();

  async function load(name, fallback) {
    try {
      return JSON.parse(await readFile(file(name), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return fallback;
      throw err;
    }
  }
  // 쓰는 도중 꺼져도 파일이 깨지지 않게: 임시 파일에 쓰고 이름 바꾸기, 한 번에 하나씩
  function save(name, data) {
    queue = queue.then(async () => {
      await mkdir(dir, { recursive: true });
      const tmp = `${file(name)}.tmp`;
      await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
      await rename(tmp, file(name));
    });
    return queue;
  }

  return {
    loadDreams: () => load('dreams.json', []),
    saveDreams: (dreams) => save('dreams.json', dreams),
    loadSettings: () => load('settings.json', {}),
    saveSettings: (settings) => save('settings.json', settings),
  };
}
