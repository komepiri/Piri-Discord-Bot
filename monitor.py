import psutil
import json

def get_system_stats():
    memory = psutil.virtual_memory()
    cpu = psutil.cpu_percent(interval=1)
    
    stats = {
        "memory_used_gb": memory.used / (1024 ** 3),  # 使用中のメモリ量 (GB単位)
        "memory_total_gb": memory.total / (1024 ** 3),  # 総メモリ量 (GB単位)
        "cpu_percent": cpu  # CPU使用率 (%)
    }
    return stats

if __name__ == "__main__":
    stats = get_system_stats()
    print(json.dumps(stats))  # JSON形式で出力