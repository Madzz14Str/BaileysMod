export default function makeOrderedDictionary<T>(idGetter: (item: T) => string): {
    array: T[];
    get: (id: string) => T | undefined;
    upsert: (item: T, mode: 'append' | 'prepend') => void;
    update: (item: T) => boolean;
    remove: (item: T) => boolean;
    updateAssign: (id: string, update: Partial<T>) => boolean;
    clear: () => void;
    filter: (contain: (item: T) => boolean) => void;
    toJSON: () => T[];
    fromJSON: (newItems: T[]) => void;
} {
    const array: T[] = [];
    const dict: { [id: string]: T } = {};

    const get = (id: string): T | undefined => dict[id];

    const update = (item: T): boolean => {
        const id = idGetter(item);
        const idx = array.findIndex(i => idGetter(i) === id);
        if (idx >= 0) {
            array[idx] = item;
            dict[id] = item;
            return true;
        }
        return false;
    };

    const upsert = (item: T, mode: 'append' | 'prepend'): void => {
        const id = idGetter(item);
        if (get(id)) {
            update(item);
        } else {
            if (mode === 'append') {
                array.push(item);
            } else {
                array.splice(0, 0, item);
            }
            dict[id] = item;
        }
    };

    const remove = (item: T): boolean => {
        const id = idGetter(item);
        const idx = array.findIndex(i => idGetter(i) === id);
        if (idx >= 0) {
            array.splice(idx, 1);
            delete dict[id];
            return true;
        }
        return false;
    };

    return {
        array,
        get,
        upsert,
        update,
        remove,
        updateAssign: (id: string, update: Partial<T>): boolean => {
            const item = get(id);
            if (item) {
                Object.assign(item, update);
                // Update dictionary key if id changed
                const newId = idGetter(item);
                if (newId !== id) {
                    delete dict[id];
                    dict[newId] = item;
                }
                return true;
            }
            return false;
        },
        clear: (): void => {
            array.splice(0, array.length);
            Object.keys(dict).forEach(key => {
                delete dict[key];
            });
        },
        filter: (contain: (item: T) => boolean): void => {
            let i = 0;
            while (i < array.length) {
                if (!contain(array[i])) {
                    delete dict[idGetter(array[i])];
                    array.splice(i, 1);
                } else {
                    i += 1;
                }
            }
        },
        toJSON: (): T[] => array,
        fromJSON: (newItems: T[]): void => {
            array.splice(0, array.length, ...newItems);
            // Rebuild dictionary from new array
            Object.keys(dict).forEach(key => delete dict[key]);
            newItems.forEach(item => {
                dict[idGetter(item)] = item;
            });
        }
    };
}