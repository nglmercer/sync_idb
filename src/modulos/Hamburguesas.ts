import { DataStorage } from 'json-obj-manager';
import { JSONFileAdapter } from 'json-obj-manager/node';
import path from "path";
const filePath = path.join(process.cwd(), "HamburguesasDB.json");

export default class Hamburguesas{
    private my = null
    private userStorage = new DataStorage<any>(new JSONFileAdapter(filePath));
    constructor(){
        if (this.my == null) this.my = new Hamburguesas()
        return this.my
    }
    async add(id:string, data:any){
        await this.userStorage.save(id, data);
    }
    async get(id:string){
        const user = await this.userStorage.load(id);
    }
    async delete(){

    }
}


